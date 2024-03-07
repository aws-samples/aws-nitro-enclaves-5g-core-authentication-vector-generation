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
# Enclave host
ENCLAVE_INSTANCE_PROFILE_ARN=$(aws ec2 describe-instances \
    --query "Reservations[].Instances[?Tags[?Key=='ApplicationName' && Value=='$APPLICATION'] && Tags[?Key=='HostName' && Value=='arpf']].IamInstanceProfile.Arn" \
    --output text \
    --region ${REGION} | uniq)
echo ENCLAVE_INSTANCE_PROFILE_ARN: $ENCLAVE_INSTANCE_PROFILE_ARN
ENCLAVE_INSTANCE_PROFILE_NAME=$(aws iam list-instance-profiles \
                                     --query "InstanceProfiles[?Arn=='$ENCLAVE_INSTANCE_PROFILE_ARN'].InstanceProfileName" \
                                     --output text \
                                     --region ${REGION})
echo ENCLAVE_INSTANCE_PROFILE_NAME: $ENCLAVE_INSTANCE_PROFILE_NAME
ENCLAVE_ROLE_ARN=$(aws iam get-instance-profile \
                        --instance-profile-name $ENCLAVE_INSTANCE_PROFILE_NAME \
                        --query "InstanceProfile.Roles[].Arn" \
                        --output text \
                        --region ${REGION})
echo ENCLAVE_ROLE_ARN: $ENCLAVE_ROLE_ARN
# Shard host
SHARD_INSTANCE_PROFILE_ARN=$(aws ec2 describe-instances \
    --query "Reservations[].Instances[?Tags[?Key=='ApplicationName' && Value=='$APPLICATION'] && Tags[?Key=='HostName' && Value=='shard']].IamInstanceProfile.Arn" \
    --output text \
    --region ${REGION} | uniq)
echo SHARD_INSTANCE_PROFILE_ARN: $SHARD_INSTANCE_PROFILE_ARN
SHARD_INSTANCE_PROFILE_NAME=$(aws iam list-instance-profiles \
                                     --query "InstanceProfiles[?Arn=='$SHARD_INSTANCE_PROFILE_ARN'].InstanceProfileName" \
                                     --output text \
                                     --region ${REGION})
echo SHARD_INSTANCE_PROFILE_NAME: $SHARD_INSTANCE_PROFILE_NAME
SHARD_ROLE_ARN=$(aws iam get-instance-profile \
                        --instance-profile-name $SHARD_INSTANCE_PROFILE_NAME \
                        --query "InstanceProfile.Roles[].Arn" \
                        --output text \
                        --region ${REGION})
echo SHARD_ROLE_ARN: $SHARD_ROLE_ARN


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
    # TDDO: pick-up PCR0 and enclave host
    cat configuration/kms/key_policy_template_for_shards.json | \
        jq --arg JQ_ROOT_PRINCIPAL_ARN ${ROOT_PRINCIPAL_ARN} '.Statement[0].Principal.AWS = $JQ_ROOT_PRINCIPAL_ARN' | \
        jq --arg JQ_OPERATOR_PRINCIPAL_ARN ${OPERATOR_ROLE_ARN} '.Statement[1].Principal.AWS = $JQ_OPERATOR_PRINCIPAL_ARN' | \
        jq --arg JQ_ENCLAVE_PRINCIPAL_ARN ${ENCLAVE_ROLE_ARN} '.Statement[2].Principal.AWS = $JQ_ENCLAVE_PRINCIPAL_ARN' | \
        jq --arg JQ_PCR0 ${ENCLAVE_PCR0} '.Statement[2].Condition.StringEqualsIgnoreCase."kms:RecipientAttestation:PCR0" = $JQ_PCR0' | \
        jq --arg JQ_SHARD_PRINCIPAL_ARN ${SHARD_ROLE_ARN} '.Statement[3].Principal.AWS = $JQ_SHARD_PRINCIPAL_ARN' | \
        jq --arg JQ_PCR0 ${ENCLAVE_PCR0} '.Statement[3].Condition.StringEqualsIgnoreCase."kms:RecipientAttestation:PCR0" = $JQ_PCR0' | \
        tee configuration/kms/key_policy_for_shards.json

    aws kms put-key-policy \
        --key-id $KEY_ID \
        --policy-name $KEY_POLICY_NAME \
        --policy file://configuration/kms/key_policy_for_shards.json \
        --region ${REGION}

fi
