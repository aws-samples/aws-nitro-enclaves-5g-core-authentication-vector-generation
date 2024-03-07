#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
from http.server import BaseHTTPRequestHandler, HTTPServer
import argparse
import socket
import json
import urllib3
from urllib.parse import parse_qs
from functools import partial

def send(cid=12,port=8888,command='{ "command":"ping" }'):
    s = socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM)
    s.connect((cid, port))
    s.sendall(command.encode())
    while (True):
        data = s.recv(4096).decode()
        if not data:
            break
        return_data = data
        #print(data, end='\n', flush=True) # Debug
    return return_data

class Server(BaseHTTPRequestHandler):
    def __init__(self, cid, enclave_port, instance_id, *args, **kwargs):
        self.cid = cid
        self.enclave_port = enclave_port
        self.instance_id = instance_id
        super().__init__(*args, **kwargs)

    def send_503_error(self,error):
        self.send_response(503)
        self.send_header("Content-type", "text/json")
        self.end_headers()
        response = f'{{ "Status": "Fail", "Message": "{error}", "Instance-ID": "{self.instance_id}"}}'
        print(response)
        self.wfile.write(bytes(response, "utf-8"))

    def send_200(self,response):
        self.send_response(200)
        self.send_header("Content-type", "text/json")
        self.end_headers()
        self.wfile.write(bytes(response, "utf-8"))
        
    def do_GET(self):
        # Parse path
        url = urllib3.util.parse_url(self.path)
        # Debug
        print(url.path)
        print(url.query)
        # Set command
        command = 'ping'
        query = None
        if ((url.path == '/status' or url.path == '/ping' or url.path == '/echo') and url.query is None):
            if url.path == '/echo':
                command = 'echo'
        elif (url.path == '/av' or url.path == '/shard0/av' or url.path == '/shard1/av'):
            command = 'get-authentication-vector'
            query = parse_qs(url.query)
        elif (url.path == '/resync' or url.path == '/shard0/resync' or url.path == '/shard1/resync'):
            command = 'resync'
            query = parse_qs(url.query)
        else:
            response = f'{{ "Status": "success", "Message": "Use /status to check the enclave status", "Instance-ID": "{self.instance_id}"}}'
            self.send_200(response)
            return
        # Query enclave
        if query is None:
            enclave_query = f'{{ "command":"{command}" }}'
        else:
            enclave_query = f'{{ "command":"{command}"'
            for key,value in query.items():
                enclave_query += f', "{key}":"{value[0]}"'
                #print(key,value) # Debug
            enclave_query += ' }'
            #print(enclave_query) # Debug
        try:
            enclave_response = send(self.cid,self.enclave_port,enclave_query)
        except TimeoutError:
            self.send_503_error('Enclave timed-out')
            return
        except ConnectionResetError:
            self.send_503_error('Enclave connection reset')
            return
        # Add instance ID
        response = json.loads(enclave_response)
        response['Instance-ID'] = self.instance_id
        self.send_200(json.dumps(response))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(prog='Shard frontend')
    parser.add_argument("--version", action="version",
    help="Prints version information.",
    version='%(prog)s 0.0.2')
    parser.add_argument("--enclave-port", type=int, default=8888)
    parser.add_argument("--cid", type=int, default=12)
    parser.add_argument("--command", type=str, default='{ "command":"ping"}')
    parser.add_argument("--listen", type=str, default='127.0.0.1')
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--test-enclave", action='store_true')
    parser.add_argument("--instance-id", type=str)
    args = parser.parse_args()
    if args.test_enclave:
        send(args.cid,args.enclave_port,args.command)
    else:
        handler = partial(Server, args.cid, args.enclave_port, args.instance_id)
        webServer = HTTPServer((args.listen, args.port), handler)
        print(f"Server started http://{args.listen}:{args.port}")

        try:
            webServer.serve_forever()
        except KeyboardInterrupt:
            pass

        webServer.server_close()
        print("Server stopped.")
