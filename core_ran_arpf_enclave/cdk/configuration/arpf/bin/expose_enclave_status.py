#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
from http.server import BaseHTTPRequestHandler, HTTPServer
import argparse
import socket
import json
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
        print(data[:16], end='\n', flush=True) # Debug
    return return_data

class Server(BaseHTTPRequestHandler):
    def __init__(self, cid, enclave_port, *args, **kwargs):
        self.cid = cid
        self.enclave_port = enclave_port
        super().__init__(*args, **kwargs)

    def do_GET(self):
        # Parse URI to get command
        if (self.path == '/status'):
            command = '{ "command":"ping" }'
        elif (self.path == '/test'):
            command = '{"command": "get-authentication-vector", "source": "udm", "supi": "imsi-999700000000001", "amf": "8000", "sqn": "000000000701", "snn": "5G:mnc070.mcc999.3gppnetwork.org", "rand": "6491483a03be60638264b5f170bf49a5"}'
        else:
            self.send_response(200)
            self.send_header("Content-type", "text/json")
            self.end_headers()
            self.wfile.write(bytes('{ "Status": "success", "Message": "Use /status to check the enclave status and /test to check the enclave functionality" }', "utf-8"))
            return
        # Check enclave
        try:
            enclave_status = send(self.cid,self.enclave_port,command)
            test_status = json.loads(enclave_status)['Status']
            #print(test_status) # Debug
        except TimeoutError:
            self.send_response(503)
            self.send_header("Content-type", "text/json")
            self.end_headers()
            self.wfile.write(bytes('{ "Status": "Fail", "Message": "Enclave timed-out" }', "utf-8"))
            return
        if test_status == 'success':
            self.send_response(200)
        else:
            self.send_response(503)
        self.send_header("Content-type", "text/json")
        self.end_headers()
        self.wfile.write(bytes(enclave_status, "utf-8"))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(prog='Expose enclave status')
    parser.add_argument("--version", action="version",
    help="Prints version information.",
    version='%(prog)s 0.0.2')
    parser.add_argument("--enclave-port", type=int, default=8888)
    parser.add_argument("--cid", type=int, default=12)
    parser.add_argument("--command", type=str, default='{ "command":"ping"}')
    parser.add_argument("--listen", type=str, default='127.0.0.1')
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--expose-http-frontend", action='store_true')
    args = parser.parse_args()
    if args.expose_http_frontend:
        handler = partial(Server, args.cid, args.enclave_port)
        webServer = HTTPServer((args.listen, args.port), handler)
        print("Server started http://%s:%s" % (args.listen, args.port))

        try:
            webServer.serve_forever()
        except KeyboardInterrupt:
            pass

        webServer.server_close()
        print("Server stopped.")
    else:
        send(args.cid,args.enclave_port,args.command)
