#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import argparse
import urllib3
import json
import sys

# curl shards.local:8080/status

# Straighforward mapping
def map_shard(imsi):
    supi = int(imsi)
    # Shard mapping: 999700000000001 to 999700000000200
    supi_range = [999700000000001,999700000000101,999700000000200]
    if supi < supi_range[0]:
        return None
    elif supi < supi_range[1]:
        return "shard0"
    elif supi <= supi_range[2]:
        return "shard1"
    elif supi > supi_range[2]:
        return None

def request(destination,port,path='/'):
    http = urllib3.PoolManager()
    response = http.request("GET", f"http://{destination}:{port}{path}")
    return response

def query_root(destination,port):
    response = request(destination,port)
    print(response.status)
    print(json.loads(response.data))

def query_status(destination,port):
    response = request(destination,port,path='/status')
    print(response.status)
    print(json.loads(response.data))

def query_ping(destination,port,command='ping'):
    response = request(destination,port,f'/{command}')
    print(response.status)
    print(json.loads(response.data))

def query_av(destination,port,imsi):
    #echo -n '{"command": "get-authentication-vector", "source": "udm", "supi": "imsi-999700000000001", "amf": "8000", "sqn": "000000000701", "snn": "5G:mnc070.mcc999.3gppnetwork.org", "rand": "6491483a03be60638264b5f170bf49a5"}' | socat - tcp-connect:arpf.local:8012
    print(f'Query AV for {imsi}')
    query = f'source=udm&supi=imsi-{imsi}&amf=8000&sqn=000000000701&snn=5G:mnc070.mcc999.3gppnetwork.org&rand=6491483a03be60638264b5f170bf49a5'
    shard = map_shard(imsi)
    if shard is None:
        print(f'Invalid imsi range {imsi}')
    response = request(destination,port,f'/{shard}/av?{query}')
    print(response.status)
    print(json.loads(response.data))

def query_resync(destination,port,imsi):
    # echo -n '{"command": "resync", "source": "udm", "supi": "imsi-999700000000001", "amf": "0000", "auts": "9fd06c3d021b31ea1decc7c41cfe", "rand": "9c745f885e3091307d5a29f2a8abbc54"}' | socat - tcp-connect:arpf.local:8012
    print(f'Query RESYNC for {imsi}')
    query = f'source=udm&supi=imsi-{imsi}&amf=8000&auts=9fd06c3d021b31ea1decc7c41cfe&rand=9c745f885e3091307d5a29f2a8abbc54'
    shard = map_shard(imsi)
    if shard is None:
        print(f'Invalid imsi range {imsi}')
    response = request(destination,port,f'/{shard}/resync?{query}')
    print(response.status)
    print(json.loads(response.data))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(prog='QueryShards')
    parser.add_argument("--version", action="version",
    help="Prints version information.",
    version='%(prog)s 0.0.1')
    parser.add_argument("-p","--port", type=int, default=8080)
    parser.add_argument("-d","--destination", type=str, default='shards.local')
    parser.add_argument("-i","--imsi", type=str, default='999700000000001', help='IMSI (default to 999700000000001)') # choices=range(999700000000001, 999700000000200)
    parser.add_argument("command", type=str, choices=['status','test','av','resync','ping','echo'])
    args = parser.parse_args()
    # Check IMSI
    if (len(args.imsi) != 15):
        print(f'Invalid IMSI {args.imsi}')
        sys.exit(-1)
    if args.command == 'status':
        query_status(args.destination,args.port)
    if args.command == 'test':
        query_root(args.destination,args.port)
    if args.command == 'av':
        query_av(args.destination,args.port,args.imsi)
    if args.command == 'resync':
        query_resync(args.destination,args.port,args.imsi)
    if args.command == 'ping' or args.command == 'echo':
        query_ping(args.destination,args.port,command=args.command)
