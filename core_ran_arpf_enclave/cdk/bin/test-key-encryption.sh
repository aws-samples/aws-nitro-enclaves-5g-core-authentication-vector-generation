#!/bin/bash

APPLICATION='EnclaveArpf'
REGION=$(aws configure get region)
KEY_ALIAS=encryption-key-01

ACCOUNT=$(aws sts get-caller-identity | jq -r ".Account")

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
echo $CIPHERTEXT

aws kms decrypt \
    --ciphertext-blob $CIPHERTEXT \
    --key-id $KEY_ID \
    --output text \
    --query Plaintext | base64 \
                            --decode
