#!/bin/bash

APPLICATION="EnclaveArpf"
ENCLAVE_MATERIAL_BUCKET_PARAMETER_NAME="/${APPLICATION}/EnclaveDeploymentPipeline/S3/EnclaveMaterialBucketName"
REGION=$(aws configure get region)
KEY_ALIAS=encryption-key-01
CIPHERTEXT_FILE=base64_cipher_encryption_key_01_4321.txt

ACCOUNT=$(aws sts get-caller-identity --region ${REGION} | jq -r ".Account")

ENCLAVE_MATERIAL_BUCKET=$(aws ssm get-parameter \
                              --name ${ENCLAVE_MATERIAL_BUCKET_PARAMETER_NAME} \
                              --query "Parameter.Value" \
                              --output text \
                              --region ${REGION})
echo $ENCLAVE_MATERIAL_BUCKET

# Get Key ID
KEY_ID=$(aws kms list-aliases \
             --query "Aliases[?AliasName=='alias/encryption-key-01'].TargetKeyId" \
             --output text \
             --region ${REGION})
echo $KEY_ID

PLAINTEXT=$(echo 4321 | base64)
echo $PLAINTEXT

CIPHERTEXT=$(aws kms encrypt \
                 --key-id $KEY_ID \
                 --plaintext $PLAINTEXT \
                 --output text \
                 --query CiphertextBlob)
echo $CIPHERTEXT > $CIPHERTEXT_FILE
# Put to S3
aws s3api put-object \
    --bucket $ENCLAVE_MATERIAL_BUCKET \
    --key testing/$CIPHERTEXT_FILE \
    --body $CIPHERTEXT_FILE \
    --region ${REGION}

rm $CIPHERTEXT_FILE

# aws kms decrypt \
#     --ciphertext-blob $CIPHERTEXT \
#     --key-id $KEY_ID \
#     --output text \
#     --query Plaintext | base64 \
#                             --decode
