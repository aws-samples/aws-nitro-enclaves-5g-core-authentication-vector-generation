#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import argparse
import socket
import json
import requests
import logging
import base64
import cbor2
logging.basicConfig(level=logging.INFO)

class Credentials:
    def __init__(self):
        self.REGION, self.ACCOUNT = self.get_identity()
        logging.info(f"{self.ACCOUNT} at {self.REGION}")

    def get_identity_document(self):
        """
        Get identity document for parent EC2 Host
        """
        headers = {'X-aws-ec2-metadata-token-ttl-seconds': '120'}
        r = requests.put("http://169.254.169.254/latest/api/token",headers=headers,timeout=5)
        token = r.text
        headers = {'X-aws-ec2-metadata-token': token}
        r = requests.get("http://169.254.169.254/latest/dynamic/instance-identity/document",headers=headers,timeout=5)
        return r

    def get_region(self,identity):
        """
        Get account of current instance identity
        """
        region = identity.json()["region"]
        return region

    def get_account(self,identity):
        """
        Get account of current instance identity
        """
        account = identity.json()["accountId"]
        return account

    def get_identity(self):
        identity = self.get_identity_document()
        region = self.get_region(identity)
        account = self.get_account(identity)
        return region, account

    def get_credentials(self):
        logging.info('Call get_credential')
        headers = {'X-aws-ec2-metadata-token-ttl-seconds': '120'}
        r = requests.put("http://169.254.169.254/latest/api/token",headers=headers,timeout=5)
        token = r.text
        headers = {'X-aws-ec2-metadata-token': token}
        r = requests.get("http://169.254.169.254/latest/meta-data/iam/security-credentials/",headers=headers,timeout=5)
        instance_profile_name = r.text

        credentials_url = "http://169.254.169.254/latest/meta-data/iam/security-credentials/{:s}".format(instance_profile_name)
        logging.info(credentials_url)
        r = requests.get(credentials_url,headers=headers,timeout=5)
        response = r.json()

        credentials = {
            'access_key_id': response['AccessKeyId'],
            'secret_access_key': response['SecretAccessKey'],
            'token': response['Token'],
            'region': self.REGION
        }
        logging.debug(f"Credentials: {credentials}")
        return credentials

class Controller:
    def __init__(self,cid,port,use_tcp,use_udp,ip_address,ciphertext_file):
        self.cid = cid
        self.port = port
        self.use_tcp = use_tcp
        self.use_udp = use_udp
        self.ip_address = ip_address
        self.ciphertext_file = ciphertext_file
        self.socket = None
        self.credentials = Credentials()

    def connect(self):
        if self.use_tcp:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((self.ip_address, self.port))
        elif self.use_udp:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.socket.connect((self.ip_address, self.port))
        else:
            self.socket = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
            self.socket.connect((self.cid, self.port))
    
    def send(self,command='echo',argument=None):
        payload = { 'command': command }
        if command == 'auth':
            payload['credentials'] = self.credentials.get_credentials()
        if command == 'ciphertext':
            try:
                with open(self.ciphertext_file,'r') as f:
                    payload['ciphertext'] = f.read()
            except FileNotFoundError as error:
                logging.error(f"File {self.ciphertext_file} could not be opened. Does it exist?")
                logging.error('Abort')
                return
            except UnicodeDecodeError as error:
                logging.error(f"File {self.ciphertext_file} is likely not base64 encoded")
                logging.error("Use base64 -w 0 (The 0 is critical to properly base64 encode)")
                logging.error('Abort')
                return
        if command == 'test-av':
            payload = {'command': 'get-authentication-vector', 'source': 'udm', 'supi': 'imsi-999700000000001', 'amf': '8000', 'sqn': '000000000701', 'snn': '5G:mnc070.mcc999.3gppnetwork.org', 'rand': '6491483a03be60638264b5f170bf49a5'}
        if command == 'test-resync':
            payload = {'command': 'resync', 'source': 'udm', 'supi': 'imsi-999700000000001', 'amf': '0000', 'auts': '9fd06c3d021b31ea1decc7c41cfe', 'rand': '9c745f885e3091307d5a29f2a8abbc54'}
        if command == 'log' or command == 'show-plaintext' or command == 'kms-decrypt' or command == 'decrypt':
            payload['argument'] = argument
        self.socket.sendall(str.encode(json.dumps(payload)))
        payload = ""
        while (True):
            data = self.socket.recv(4096).decode()
            if not data:
                break
            if command == 'get-attestation':
                payload += data
            else:
                print(data, end='\n', flush=True)
        if command == 'get-attestation':
            attestation_data = base64.b64decode(json.loads(payload)["Response"]).decode()
            #print(attestation_data[:100])
            blob_uint8 = [int(uint8.strip()) for uint8 in attestation_data[attestation_data.find('[')+1:attestation_data.find(']')].split(',')]
            #print(blob[0:20])
            blob_b = b''.join([x.to_bytes(1,byteorder='big') for x in blob_uint8])
            #print(blob_b[0:40])
            attestation_doc = cbor2.loads(cbor2.loads(blob_b)[2])
            print(attestation_doc)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(prog='shout_echo')
    parser.add_argument("--version", action="version",
                        help="Prints version information.",
                        version='%(prog)s 0.0.1')
    parser.add_argument("--port", type=int, default=8888)
    parser.add_argument("--cid", type=int, default=12)
    parser.add_argument("--command", type=str, default='echo')
    parser.add_argument("--argument", type=str)
    parser.add_argument("--ciphertext-file", type=str, default='ciphertext.base64')
    parser.add_argument("--use-tcp",action="store_true")
    parser.add_argument("--use-udp",action="store_true")
    parser.add_argument("--ip-address",type=str,default="127.0.0.1")
    args = parser.parse_args()
    controller = Controller(args.cid,args.port,args.use_tcp,args.use_udp,args.ip_address,args.ciphertext_file)
    controller.connect()
    controller.send(args.command,args.argument)
