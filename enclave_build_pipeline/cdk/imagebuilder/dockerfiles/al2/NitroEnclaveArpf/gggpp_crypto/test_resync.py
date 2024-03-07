#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
from milenage import Milenage

k_str='465B5CE8B199B49FAA5F0A2EE238A6BC'
opc_str='e8ed289deba952e4283b54e88e6183ca'
k_b = bytes.fromhex(k_str)
opc_b = bytes.fromhex(opc_str)

milenage = Milenage()
print(milenage.amf)
print(milenage.amf.hex())

input = {'command': 'resync', 'source': 'udm', 'supi': 'imsi-999700000000001', 'amf': '0000', 'auts': '9fd06c3d021b31ea1decc7c41cfe', 'rand': '9c745f885e3091307d5a29f2a8abbc54'}

print(len(input['auts']))
print(len(input['rand']))

auts_b = bytes.fromhex(input['auts'])
rand_b = bytes.fromhex(input['rand'])
print(auts_b.hex(),rand_b.hex())

milenage.amf = bytes.fromhex(input['amf'])
sqn_ms_int,mac_s = milenage.generate_resync(auts_b,k_b,opc_b,rand_b)
print(sqn_ms_int,mac_s.hex())
