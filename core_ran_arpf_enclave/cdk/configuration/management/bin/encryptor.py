#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import boto3
from botocore.exceptions import ClientError
import base64
import argparse
import logging
logging.basicConfig(level=logging.INFO)
from cryptography.fernet import Fernet

NUM_BYTES_FOR_LEN = 4

class Encryptor:
    def __init__(self,alias,filename,region="eu-central-1"):
        self.kms_client = boto3.client("kms",region_name=region)
        self.key_alias = alias
        self.filename = filename

    def kms_get_data_key(self,key_id,key_spec='AES_256'):
        # See https://boto3.amazonaws.com/v1/documentation/api/latest/guide/kms-example-encrypt-decrypt-file.html
        try:
            response = self.kms_client.generate_data_key(KeyId=key_id, KeySpec=key_spec)
        except ClientError as e:
            logging.error(e)
            return None, None
        # Return the encrypted and plaintext data key
        return response['CiphertextBlob'], base64.b64encode(response['Plaintext'])

    def kms_decrypt_data_key(self,data_key_encrypted):
        try:
            response = self.kms_client.decrypt(KeyId=f"alias/{self.key_alias}", CiphertextBlob=data_key_encrypted)
        except ClientError as e:
            logging.error(e)
            return None
        return base64.b64encode((response['Plaintext']))

    def client_side_encrypt_plaintext(self,plaintext):
        # See https://www.learnaws.org/2021/02/20/aws-kms-boto3-guide/
        data_key_encrypted, data_key_plaintext = self.kms_get_data_key(f"alias/{self.key_alias}")
        if data_key_encrypted is None:
            return False
        logging.info('Created new AWS KMS data key')
        # Encrypt the file (the data_key must base64-encoded)
        f = Fernet(data_key_plaintext)
        file_contents_encrypted = f.encrypt(plaintext) # See https://cryptography.io/en/latest/fernet/#cryptography.fernet.Fernet.encrypt
        # Write the encrypted data key and encrypted file contents together
        try:
            logging.info(len(len(data_key_encrypted).to_bytes(NUM_BYTES_FOR_LEN,byteorder='big')))
            logging.info(len(data_key_encrypted))
            logging.info(len(file_contents_encrypted))
            with open(self.filename, 'wb') as file_encrypted:
                file_encrypted.write(len(data_key_encrypted).to_bytes(NUM_BYTES_FOR_LEN,byteorder='big'))
                file_encrypted.write(data_key_encrypted)
                file_encrypted.write(file_contents_encrypted)
                logging.info("The file is not base64 encoded. Use base64 -w 0 to do it")
        except IOError as e:
            logging.error(e)
            return False
        return True

    def client_side_encrypt_plaintext_from_file(self,file):
        with open(file, "rb") as f:
            plaintext = f.read()
            self.client_side_encrypt_plaintext(plaintext)
            #base64_ciphertext_b = self.client_side_encrypt_plaintext(plaintext)
            #return base64_ciphertext_b

    def client_side_decrypt_ciphertext_from_file(self,use_base64=False):
        try:
            with open(self.filename, 'rb') as f:
                ciphertext = f.read()
        except IOError as e:
            logging.error(e)
            return False
        #logging.info(len(ciphertext))
        #logging.info(ciphertext)
        if use_base64:
            ciphertext = base64.b64decode(ciphertext)

        # The first NUM_BYTES_FOR_LEN bytes contain the integer length of the
        # encrypted data key.
        # Add NUM_BYTES_FOR_LEN to get index of end of encrypted data key/start
        # of encrypted data.
        data_key_encrypted_len = int.from_bytes(ciphertext[:NUM_BYTES_FOR_LEN],byteorder='big')+NUM_BYTES_FOR_LEN
        data_key_encrypted = ciphertext[NUM_BYTES_FOR_LEN:data_key_encrypted_len]
        logging.info(data_key_encrypted_len)
        logging.info(len(data_key_encrypted))

        # Decrypt the data key before using it
        data_key_plaintext = self.kms_decrypt_data_key(data_key_encrypted)
        if data_key_plaintext is None:
            return False

        # Decrypt the rest of the file
        f = Fernet(data_key_plaintext)
        plaintext_b = f.decrypt(ciphertext[data_key_encrypted_len:])
        logging.info(plaintext_b.decode())

    def kms_encrypt_plaintext(self,plaintext):
        # Note from boto3 doc: When you use the HTTP API or the Amazon Web Services CLI, the value is Base64-encoded. Otherwise, it is not Base64-encoded
        # Hence, base64 encoding needed (check with the cli to convince yourself)
        response = self.kms_client.encrypt(KeyId=f"alias/{self.key_alias}", Plaintext=plaintext)
        logging.debug(response)
        binary_ciphertext_b = response[u"CiphertextBlob"] # Note: bytes
        base64_ciphertext_b = base64.b64encode(binary_ciphertext_b)  # Base64 encoding, still bytes, use decode() to get strings
        logging.info(base64_ciphertext_b)
        return base64_ciphertext_b

    def kms_decrypt_ciphertext(self,base64_ciphertext):
        binary_ciphertext_b = base64.b64decode(base64_ciphertext) # Note: bytes
        # With boto3, a binary ciphertext is expected (not base64 encoded)
        response = self.kms_client.decrypt(KeyId=f"alias/{self.key_alias}", CiphertextBlob=binary_ciphertext_b)
        logging.debug(response)
        plaintext_b = response[u"Plaintext"]
        plaintext = plaintext_b.decode()
        logging.info(plaintext)

    def kms_encrypt_plaintext_from_file(self,file):
        with open(file, "r") as f:
            plaintext = f.read()
            base64_ciphertext_b = self.kms_encrypt_plaintext(plaintext)
            return base64_ciphertext_b

    def kms_decrypt_ciphertext_from_file(self):
        with open(self.filename, "r") as f:
            base64_ciphertext = f.read() # Note: str
            self.kms_decrypt_ciphertext(base64_ciphertext)

    def kms_ciphertext_to_file(self,base64_ciphertext_b):
        with open(self.filename, "w") as f:
            f.write(base64_ciphertext_b.decode())
            f.close
        #if binary_ciphertext_b is None:
        #    binary_ciphertext_b = base64.b64decode(base64_ciphertext_b)
        #with open(self.file+".binary", "wb") as f:
        #    f.write(binary_ciphertext_b)
        #    f.close
        #
        # To decrypt with the KMS CLI:
        # aws kms decrypt \
        #    --ciphertext-blob "fileb://string.encrypted.binary" \
        #    --output "text" \
        #    --query "Plaintext" | base64 --decode
        # Note that with AWS KMS CLI, --ciphertext-blob expects a binary input
        # If the above does not work, do:
        # base64 -di string.encrypted > string.encrypted.binary


if __name__ == '__main__':
    # Examples:
    # ---------
    #
    # Client-side encryption:
    # ./encryptor.py --alias coreran-encryption-key-01 --plaintext-file data/plaintext.csv --ciphertext-file sub_data.encrypted
    parser = argparse.ArgumentParser()
    parser.add_argument("--alias", required=True, help="KMS key alias")
    parser.add_argument("--string",
                        type=str, help="String to encrypt",default="31.12.1977")
    parser.add_argument("--kms","-k",action='store_true',help="Use KMS for encryption when encrypting a file. Default is to use client-side")
    parser.add_argument("--base64","-b",action='store_true',help="Encrypted file is base64 encoded (with w = 0)")
    parser.add_argument("--ciphertext-file",
                        type=str,
                        required=True,
                        help="File to store or load the encrypted string")
    parser.add_argument("--plaintext-file",type=str,
                        help="Use the content of the file as plaintext, instead of the command line input")
    parser.add_argument("--region",
                        type=str,default="eu-central-1",help="AWS default region to use")
    parser.add_argument("--decrypt",action='store_true')
    args = parser.parse_args()
    encryptor = Encryptor(args.alias,args.ciphertext_file)
    if args.decrypt:
        if args.kms is True:
            encryptor.kms_decrypt_ciphertext_from_file()
        else:
            encryptor.client_side_decrypt_ciphertext_from_file(args.base64)
    else:
        if args.plaintext_file is not None:
            if args.kms is True:
                base64_ciphertext = encryptor.kms_encrypt_plaintext_from_file(args.plaintext_file)
                encryptor.kms_ciphertext_to_file(base64_ciphertext)
            else:
                # Client-side
                encryptor.client_side_encrypt_plaintext_from_file(args.plaintext_file)
        else:
            base64_ciphertext = encryptor.kms_encrypt_plaintext(args.string)
            encryptor.kms_ciphertext_to_file(base64_ciphertext)
