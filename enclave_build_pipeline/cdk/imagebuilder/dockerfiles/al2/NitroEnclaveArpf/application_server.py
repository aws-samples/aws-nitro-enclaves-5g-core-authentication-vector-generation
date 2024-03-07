#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import socket
import threading
import argparse
import botocore
import boto3
import json
import base64
import subprocess
import logging
logging.basicConfig(level=logging.INFO)

from io import StringIO
import csv
from gggpp_crypto.milenage import Milenage
# For client-side
from cryptography.fernet import Fernet
NUM_BYTES_FOR_LEN = 4

REGION='eu-central-1'

class Credentials():
    def __init__(self,region=REGION):
        self.region = region
        self.access_key_id = None
        self.secret_access_key = None
        self.token = None

    @property
    def region(self):
        return self.__region
    @region.setter
    def region(self,region):
        self.__region = region

    def reset(self,region=REGION):
        self.region = region
        self.access_key_id = None
        self.secret_access_key = None
        self.token = None

    def update(self,credentials):
        logging.debug(credentials)
        self.access_key_id = credentials['access_key_id']
        self.secret_access_key = credentials['secret_access_key']
        self.token = credentials['token']
        self.region = credentials['region']

    def valid(self):
        if self.token is None or self.secret_access_key is None or self.access_key_id is None:
            return False
        else:
            return True

    def log(self):
        logging.info(self.region)
        logging.info(self.access_key_id)
        logging.info(self.secret_access_key)
        logging.info(self.token)

class SecretStore():
    def __init__(self):
        self.ciphertext_base64_blob = None # Base64 encoded secret
        self.plaintext = None
        self.KMS_PROXY_PORT="8001" # Must be a string

    def decrypt(self,credentials,backend='client-side',use_kms_tool=True):
        if self.ciphertext_base64_blob is None:
            return 'fail','Ciphertext needs to be updated first'
        if backend=='kms':
            if use_kms_tool:
                return self.enclave_decrypt(credentials)
            else:
                return self.kms_decrypt(credentials)
        elif backend=='client-side':
            return self.client_side_decrypt(credentials,use_kms_tool)
        else:
            return 'fail', 'Invalid backend (kms or client-side)'

    def kms_decrypt_data_key(self,credentials,data_key_encrypted):
        try:
            kms_client = boto3.client(
                'kms',
                region_name=credentials.region,
                aws_access_key_id=credentials.access_key_id,
                aws_secret_access_key=credentials.secret_access_key,
                aws_session_token=credentials.token
            )
            response = kms_client.decrypt(CiphertextBlob=data_key_encrypted)
        except botocore.exceptions.ClientError as error:
            logging.error(error.response['Error']['Code'])
            logging.error(error.response['Error']['Message'])
            return 'fail', error.response['Error']['Code']
        except botocore.exceptions.NoCredentialsError as error:
            logging.error(error)
            return 'fail', 'No credentials'
        except botocore.exceptions.SSLError as error:
            logging.error(error)
            return 'fail', 'SSL error, is the KMS proxy configured?'

        return base64.b64encode((response['Plaintext']))

    def enclave_decrypt_data_key(self,credentials,data_key_encrypted):
        if not credentials.valid():
            return 'fail', 'Invalid credentials. Have you set the credentials already?'
        try:
            proc = subprocess.Popen(
            [
                "/app/kmstool_enclave_cli",
                "decrypt",
                "--region", credentials.region,
                "--proxy-port", self.KMS_PROXY_PORT,
                "--aws-access-key-id", credentials.access_key_id,
                "--aws-secret-access-key", credentials.secret_access_key,
                "--aws-session-token", credentials.token,
                "--ciphertext", data_key_encrypted,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE)
        except FileNotFoundError as error:
            return 'fail', 'kms_tool_cli not available on this platform, are you running within the enclave?'

        ret = proc.communicate()
        logging.debug(ret)

        if ret[0]:
            ret0 = proc.communicate()[0].decode()
            plaintext = ret0.split(":")[1].strip()
            return plaintext
            #b64text = proc.communicate()[0].decode()
            #return b64text
            #self.plaintext = base64.b64decode(b64text).decode()
            #logging.info(self.plaintext)
            #return 'success', 'See the log'
        else:
            return 'fail','KMS Error. Decryption Failed.'



    def client_side_decrypt(self,credentials,use_kms_tool=True):
        binary_ciphertext_b = base64.b64decode(self.ciphertext_base64_blob)
        # The first NUM_BYTES_FOR_LEN bytes contain the integer length of the
        # encrypted data key.
        # Add NUM_BYTES_FOR_LEN to get index of end of encrypted data key/start
        # of encrypted data.
        data_key_encrypted_len = int.from_bytes(binary_ciphertext_b[:NUM_BYTES_FOR_LEN],byteorder='big')+NUM_BYTES_FOR_LEN
        data_key_encrypted = binary_ciphertext_b[NUM_BYTES_FOR_LEN:data_key_encrypted_len]
        logging.info(data_key_encrypted_len)
        logging.info(len(data_key_encrypted))

        # Decrypt the data key before using it
        if use_kms_tool:
            data_key_plaintext = self.enclave_decrypt_data_key(credentials,base64.b64encode(data_key_encrypted))
        else:
            data_key_plaintext = self.kms_decrypt_data_key(credentials,data_key_encrypted)
        if isinstance(data_key_plaintext,tuple): # If true, is an error message
            return data_key_plaintext

        # Decrypt the rest of the file
        f = Fernet(data_key_plaintext)
        plaintext_b = f.decrypt(binary_ciphertext_b[data_key_encrypted_len:])
        self.plaintext = plaintext_b.decode()
        logging.info(self.plaintext)
        return 'success','See the log'


    def kms_decrypt(self,credentials):
        try:
            kms_client = boto3.client(
                'kms',
                region_name=credentials.region,
                aws_access_key_id=credentials.access_key_id,
                aws_secret_access_key=credentials.secret_access_key,
                aws_session_token=credentials.token
            )
            binary_ciphertext_b = base64.b64decode(self.ciphertext_base64_blob)
            response = kms_client.decrypt(CiphertextBlob=binary_ciphertext_b)
            logging.debug(response)
            plaintext_b = response[u"Plaintext"]
            self.plaintext = plaintext_b.decode()
            logging.info(self.plaintext)
            return 'success','See the log'
        except botocore.exceptions.ClientError as error:
            logging.error(error.response['Error']['Code'])
            logging.error(error.response['Error']['Message'])
            return 'fail', error.response['Error']['Code']
        except botocore.exceptions.NoCredentialsError as error:
            logging.error(error)
            return 'fail', 'No credentials'
        except botocore.exceptions.SSLError as error:
            logging.error(error)
            return 'fail', 'SSL error, is the KMS proxy configured?'

    def enclave_decrypt(self,credentials):
        """
        use KMS Tool Enclave Cli to decrypt cipher text
        """
        if not credentials.valid():
            return 'fail', 'Invalid credentials. Have you set the credentials already?'
        try:
            proc = subprocess.Popen(
            [
                "/app/kmstool_enclave_cli",
                "decrypt",
                "--region", credentials.region,
                "--proxy-port", self.KMS_PROXY_PORT,
                "--aws-access-key-id", credentials.access_key_id,
                "--aws-secret-access-key", credentials.secret_access_key,
                "--aws-session-token", credentials.token,
                "--ciphertext", self.ciphertext_base64_blob,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE)
        except FileNotFoundError as error:
            return 'fail', 'kms_tool_cli not available on this platform, are you running within the enclave?'

        ret = proc.communicate()

        if ret[0]:
            ret0 = proc.communicate()[0].decode()
            self.plaintext = ret0.split(":")[1].strip()
            #b64text = proc.communicate()[0].decode()
            #self.plaintext = base64.b64decode(b64text).decode()
            logging.info(self.plaintext)
            return 'success', 'See the log'
        else:
            return 'fail','KMS Error. Decryption Failed.'

    def plaintext_available(self):
        if self.plaintext is None:
            return False
        else:
            return True

    def get_attestation_document(self):
        proc = subprocess.Popen(["/app/att_doc_retriever_sample"], stdout=subprocess.PIPE)
        out, err = proc.communicate()
        logging.info(out[0:100])
        attestation_doc_b64 = base64.b64encode(out).decode()
        return 'success', attestation_doc_b64

    def log(self):
        logging.info(self.ciphertext_base64_blob)

class ARPF:
    def __init__(self,amf=b'\x80\x00'):
        self.milenage = Milenage(amf)
        self.db = None
        logging.info(self.milenage.amf)

    def check_amf(self,amf):
        amf_b = bytes.fromhex(amf)
        if self.milenage.amf != amf_b:
            self.milenage.amf = amf_b
            logging.info(self.milenage.amf)

    def generate_authentication_vector(self,supi,sqn,snn,rand):
        supi = supi[5:] # Remove the initial "supi-"
        logging.info(supi)
        k_b = bytes.fromhex(self.db[supi]['k'])
        opc_b = bytes.fromhex(self.db[supi]['opc'])
        sqn_int = int.from_bytes(bytes.fromhex(sqn),byteorder='big',signed=False)
        snn_b = snn.encode('ASCII')
        rand_b = bytes.fromhex(rand)

        # Returns Open5gsAuthVector(rand, xres_star, autn, kausf)
        av = self.milenage.generate_authentication_vector_open5gs(k_b,opc_b,sqn_int,snn_b,rand_b) 
        # For xres_start, Open5gs appears to use the last 32 bytes only
        return 'success', { 'rand': av[0].hex(), 'xres_star': av[1].hex()[32:], 'autn': av[2].hex(), 'kausf': av[3].hex() }

    def resync(self,supi,auts,rand):
        supi = supi[5:]
        logging.info(supi)
        k_b = bytes.fromhex(self.db[supi]['k'])
        opc_b = bytes.fromhex(self.db[supi]['opc'])
        auts_b = bytes.fromhex(auts)
        rand_b = bytes.fromhex(rand)
        sqn_ms,mac_s = self.milenage.generate_resync(auts_b,k_b,opc_b,rand_b)
        return 'success', { 'sqn_ms': sqn_ms.hex(), 'mac_s': mac_s.hex() }

    def db_loaded(self):
        if self.db == None:
            return False
        else:
            return True

    def load_db(self,subscriber_data):
        self.db = {}
        f = StringIO(subscriber_data)
        reader = csv.reader(f,delimiter=',')
        for row in reader:
            #logging.info(f'Loading {row[0]} in db')
            self.db[row[0]] = { 'k': row[1], 'opc': row[2] }
        logging.info(self.db)

    def log_db(self):
        logging.info(self.db)

class Server:
    def __init__(self,port=8888):
        self.port = port
        self.conn_backlog = 128
        self.credentials = Credentials()
        self.secret_store = SecretStore()
        self.arpf = ARPF()
        self.lock = threading.Lock()
        logging.info('Enclave application server instance created')

    def echo(self):
        r = { 'Status': 'success', 'Response': 'echo' }
        return r

    def pong(self):
        r = { 'Status': 'success', 'Response': 'pong' }
        return r

    def check_kms_api(self,full_response=False):
        client = boto3.client(
            'kms',
            region_name=self.credentials.region,
            aws_access_key_id=self.credentials.access_key_id,
            aws_secret_access_key=self.credentials.secret_access_key,
            aws_session_token=self.credentials.token
        )
        try:
            response = client.list_keys()
            if full_response:
                r = { 'Status': 'success', 'Response': response }
            else:
                r = { 'Status': 'success' }
        except botocore.exceptions.ClientError as error:
            logging.error(error.response['Error']['Code'])
            logging.error(error.response['Error']['Message'])
            #logging.error(error)
            r = { 'Status': 'fail', 'Error': error.response['Error']['Code'] }
        except botocore.exceptions.NoCredentialsError as error:
            logging.error(error)
            r = { 'Status': 'fail', 'Error': 'n/a' }
        except botocore.exceptions.EndpointConnectionError as error:
            logging.error(error)
            r = { 'Status': 'fail', 'Error': 'Endpoint not reachable, is the vsock proxy up and running?' }
        except botocore.exceptions.SSLError as error:
            logging.error(error)
            r = { 'Status': 'fail', 'Error': 'SSL validation issue, is the vsock proxy up and running?' }
        return r

    def authorize(self,credentials):
        self.credentials.update(credentials)
        r = { 'Status': 'success', 'Response': 'Credentials updated'}
        return r

    def reset_credentials(self):
        self.credentials.reset()
        r = { 'Status': 'success', 'Response': 'Credentials re-initialized'}
        return r

    def update_ciphertext(self,ciphertext):
        self.secret_store.ciphertext_base64_blob = ciphertext
        self.secret_store.log()
        r = { 'Status': 'success', 'Response': 'Ciphertext updated'}
        return r

    def decrypt(self,backend='client-side'):
        status,response = self.secret_store.decrypt(self.credentials,backend)
        r = { 'Status': status, 'Response': response }
        return r

    def kms_decrypt(self,backend='client-side'):
        status,response = self.secret_store.decrypt(self.credentials,backend,use_kms_tool=False)
        r = { 'Status': status, 'Response': response }
        return r

    def show_plaintext(self,length=4):
        if self.secret_store.plaintext is None:
            return { 'Status': 'fail', 'Response': 'No plaintext' }
        else:
            return { 'Status': 'succes', 'Response': self.secret_store.plaintext[:length] }

    def generate_authentication_vector(self,payload):
        # Ensure arpf DB with IMSI is loaded from the secret store
        if not self.secret_store.plaintext_available():
            r = { 'Status': 'fail', 'Response': 'No plaintext available to load the subscriber DB' }
            return r
        if not self.arpf.db_loaded():
            self.arpf.load_db(self.secret_store.plaintext)
        self.arpf.check_amf(payload['amf'])
        status,response = self.arpf.generate_authentication_vector(payload['supi'],payload['sqn'],payload['snn'],payload['rand'])
        return { 'Status': status, 'Response': response }

    def resync(self,payload):
        if not self.secret_store.plaintext_available():
            r = { 'Status': 'fail', 'Response': 'No plaintext available to load the subscriber DB' }
            return r
        if not self.arpf.db_loaded():
            self.arpf.load_db(self.secret_store.plaintext)
        self.arpf.check_amf(payload['amf'])
        status,response = self.arpf.resync(payload['supi'],payload['auts'],payload['rand'])
        return { 'Status': status, 'Response': response }

    def get_attestation_document(self):
        status,response = self.secret_store.get_attestation_document()
        return { 'Status': status, 'Response': response }
        #return response

    def log(self,argument='credentials'):
        if argument=='credentials':
            self.credentials.log()
            r = { 'Status': 'success', 'Response': 'Credentials logged'}
        elif argument=='secret':
            self.secret_store.log()
            r = { 'Status': 'success', 'Response': 'Secret Store data logged'}
        elif argument=='arpf':
            self.arpf.log_db()
            r = { 'Status': 'success', 'Response': 'ARPF DB logged'}
        else:
            r = { 'Status': 'fails', 'Error': 'Undefined content to log' }
        return r

    def error(self,error='InvalidCommand'):
        r = { 'Status': 'fail', 'Error': error }
        return r

    def bind(self,TCP=False):
        if TCP:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind(('127.0.0.1', self.port))
        else:
            self.socket = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
            self.cid = socket.VMADDR_CID_ANY
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind((self.cid, self.port))
        self.socket.listen(self.conn_backlog)
        logging.info(f"Server started on port {self.port}")

    def listen(self):
        while (True):
            client,addr = self.socket.accept()
            client.settimeout(60)
            threading.Thread(target = self.run,args=(client,addr)).start()

    def run(self,client,addr):
        #while (True):
            #conn,addr = self.socket.accept()
        with client:
            logging.info(f"Connection accepted from {addr}")
            command = None
            # Assuming json is being sent
            try:
                client_payload = json.loads(client.recv(65536).decode())
                logging.info(client_payload)
                command = client_payload['command']
            except json.decoder.JSONDecodeError as error:
                logging.error(error)

            if command == 'echo':
                r = self.echo()
            elif command == 'ping':
                r = self.pong()
            elif command == 'check':
                r = self.check_kms_api()
            elif command == 'check-full':
                r = self.check_kms_api(True)
            elif command == 'auth':
                if 'credentials' not in client_payload:
                    r = self.authorize('MalformattedCommand')
                else:
                    r = self.authorize(client_payload['credentials'])
            elif command == 'drop-auth':
                r = self.reset_credentials()
            elif command == 'ciphertext':
                if 'ciphertext' not in client_payload:
                    r = self.error('MalformattedCommand')
                else:
                    with self.lock:
                        r = self.update_ciphertext(client_payload['ciphertext'])
            elif command == 'decrypt': # Use kms_tool with attestation support
                if 'argument' not in client_payload: # client-side or kms
                    r = self.error('MalformattedCommand: provide argument = kms or client-side')
                else:
                    with self.lock:
                        r = self.decrypt(client_payload['argument'])
            elif command == 'kms-decrypt': # Use kms for decryption
                if 'argument' not in client_payload: # client-side or kms
                    r = self.error('MalformattedCommand: provide argument = kms or client-side')
                else:
                    with self.lock:
                        r = self.kms_decrypt(client_payload['argument'])
            elif command == 'show-plaintext':
                if 'argument' not in client_payload:
                    r = self.show_plaintext()
                else:
                    try:
                        r = self.show_plaintext(int(client_payload['argument']))
                    except TypeError as error:
                        r = self.error('InvalidArgument')
            elif command == 'get-authentication-vector':
                r = self.generate_authentication_vector(client_payload)
            elif command == 'resync':
                r = self.resync(client_payload)
            elif command == 'get-attestation':
                r = self.get_attestation_document()
            elif command == 'log':
                if 'argument' not in client_payload:
                    r = self.error('MalformattedCommand')
                else:
                    r = self.log(client_payload['argument'])
            else: # Instead of hardcoding the commands expected by the application, pass it to the application server directly
                r = self.error()
            client.send(str.encode(json.dumps(r)))

            
if __name__ == '__main__':
    parser = argparse.ArgumentParser(prog='application server')
    parser.add_argument("--version", action="version",
                        help="Prints version information.",
                        version='%(prog)s 0.0.1')
    parser.add_argument("--port", type=int, default=8888)
    parser.add_argument("--use-tcp",action='store_true',help='Use AF_INET instead of VSOCK')
    args = parser.parse_args()
 
    server = Server(args.port)
    server.bind(args.use_tcp)
    server.listen()
