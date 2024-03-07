#!/bin/bash

APPLICATION="EnclaveArpf"
ENCLAVE_MATERIAL_BUCKET_PARAMETER_NAME="/${APPLICATION}/EnclaveDeploymentPipeline/S3/EnclaveMaterialBucketName"
REGION=$(aws configure get region)
KEY_ALIAS=encryption-key-01
CIPHERTEXT_FILE=base64_cipher_encryption_key_01_4321.txt
CIPHERTEXT_FILE_BLOB=binary_cipher_encryption_key_01_4321

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

aws s3api get-object \
    --bucket $ENCLAVE_MATERIAL_BUCKET \
    --key testing/$CIPHERTEXT_FILE \
    --region ${REGION} \
    $CIPHERTEXT_FILE

PLATFORM=$(uname)
if [ "$PLATFORM" == "Linux" ]; then
    base64 --decode $CIPHERTEXT_FILE > $CIPHERTEXT_FILE_BLOB
else
    base64 -d -i $CIPHERTEXT_FILE -o $CIPHERTEXT_FILE_BLOB
fi

#CIPHERTEXT=$(cat $CIPHERTEXT_FILE)
#echo $CIPHERTEXT
# Alternative below is to use the ciphertext file directly via --ciphertext-blob $CIPHERTEXT \

aws kms decrypt \
    --ciphertext-blob fileb://$CIPHERTEXT_FILE_BLOB \
    --key-id $KEY_ID \
    --output text \
    --query Plaintext | base64 \
                            --decode

rm $CIPHERTEXT_FILE
rm $CIPHERTEXT_FILE_BLOB
