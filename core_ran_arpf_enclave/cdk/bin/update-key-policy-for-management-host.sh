#!/bin/bash

APPLICATION='EnclaveArpf'
REGION=$(aws configure get region)
KEY_ALIAS=encryption-key-01
PCR0_PARAMETER='/EnclavePipeline/Enclave/Arpf/Pcr/0'

ACCOUNT=$(aws sts get-caller-identity | jq -r ".Account")

# Get Key ID
KEY_ID=$(aws kms list-aliases \
             --query "Aliases[?AliasName=='alias/encryption-key-01'].TargetKeyId" \
             --output text \
             --region ${REGION})
echo Key ID: $KEY_ID

# Check key-policy
KEY_POLICY_NAME=$(aws kms list-key-policies --key-id $KEY_ID \
                      --query "PolicyNames[]" \
                      --output text \
                      --region ${REGION})

# Get role ARN via instance profile
#
# Operator/management host
OPERATOR_INSTANCE_PROFILE_ARN=$(aws ec2 describe-instances \
    --query "Reservations[].Instances[?Tags[?Key=='ApplicationName' && Value=='$APPLICATION'] && Tags[?Key=='HostName' && Value=='management']].IamInstanceProfile.Arn" \
    --output text \
    --region ${REGION} | uniq)
echo OPERATOR_INSTANCE_PROFILE_ARN: $OPERATOR_INSTANCE_PROFILE_ARN
OPERATOR_INSTANCE_PROFILE_NAME=$(aws iam list-instance-profiles \
                                     --query "InstanceProfiles[?Arn=='$OPERATOR_INSTANCE_PROFILE_ARN'].InstanceProfileName" \
                                     --output text \
                                     --region ${REGION})
echo OPERATOR_INSTANCE_PROFILE_NAME: $OPERATOR_INSTANCE_PROFILE_NAME
OPERATOR_ROLE_ARN=$(aws iam get-instance-profile \
                        --instance-profile-name $OPERATOR_INSTANCE_PROFILE_NAME \
                        --query "InstanceProfile.Roles[].Arn" \
                        --output text \
                        --region ${REGION})
echo OPERATOR_ROLE_ARN: $OPERATOR_ROLE_ARN


if [ "$KEY_POLICY_NAME"=="default" ]; then
    echo Key policy name is default, proceed
    # Get current policy
    KEY_POLICY=$(aws kms get-key-policy \
        --key-id $KEY_ID \
        --policy-name $KEY_POLICY_NAME \
        --output json \
        --region ${REGION})
    #echo $KEY_POLICY | jq --color-output '. | fromjson'
    KEY_POLICY_STRING=$(echo $KEY_POLICY | jq --color-output '. | tostring')

    ROOT_PRINCIPAL_ARN=arn:aws:iam::$ACCOUNT:root
    ENCLAVE_PCR0=$(aws ssm get-parameter --name $PCR0_PARAMETER --query "Parameter.Value" --output text)
    echo $ENCLAVE_PCR0
    # Parse template and create policy
    #
    cat configuration/kms/key_policy_template_for_management_host.json | \
        jq --arg JQ_ROOT_PRINCIPAL_ARN ${ROOT_PRINCIPAL_ARN} '.Statement[0].Principal.AWS = $JQ_ROOT_PRINCIPAL_ARN' | \
        jq --arg JQ_OPERATOR_PRINCIPAL_ARN ${OPERATOR_ROLE_ARN} '.Statement[1].Principal.AWS = $JQ_OPERATOR_PRINCIPAL_ARN' | \
        tee configuration/kms/key_policy_for_management_host.json

    aws kms put-key-policy \
        --key-id $KEY_ID \
        --policy-name $KEY_POLICY_NAME \
        --policy file://configuration/kms/key_policy_for_management_host.json \
        --region ${REGION}

fi
