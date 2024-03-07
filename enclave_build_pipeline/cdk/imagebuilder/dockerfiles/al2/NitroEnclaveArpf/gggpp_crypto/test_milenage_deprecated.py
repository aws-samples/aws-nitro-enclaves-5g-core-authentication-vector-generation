#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
from milenage import Milenage

k_str='465B5CE8B199B49FAA5F0A2EE238A6BC'
opc_str='e8ed289deba952e4283b54e88e6183ca'
snni_str = '5G:mnc070.mcc999.3gppnetwork.org'
k_b = bytes.fromhex(k_str)
opc_b = bytes.fromhex(opc_str)

milenage = Milenage()
print(milenage.amf.hex())


# First test
rand_str='7E6CDACA3AC03E49CAEA61DA6C33314B'
sqn_str = '0000000003E1'
#
sqn_int = int.from_bytes(bytearray.fromhex(sqn_str),byteorder='big',signed=False)
snni_b = snni_str.encode('ASCII')
rand_b = bytes.fromhex(rand_str)
milenage.generate_m5gran_vector_alt(k_b,opc_b,sqn_int,snni_b,rand_b)
#
output_kausf_str='0da0e97de417ea8795f654dfbc8253e2e7112d813eb43d138e6e64a547df5e4a'
output_ck_str='3c56c1d71588053b1508d9a2b768963b'
output_ik_str='dd91ca9575df98ddcd9c1c107b3790d9'

# Second test
rand_str='0b8a7430af9116117376176a70ad0318'
sqn_str = '000000000401'
#
sqn_int = int.from_bytes(bytearray.fromhex(sqn_str),byteorder='big',signed=False)
snni_b = snni_str.encode('ASCII')
rand_b = bytes.fromhex(rand_str)
milenage.generate_m5gran_vector_alt(k_b,opc_b,sqn_int,snni_b,rand_b)
#
output_kausf_str='6e16300ed7f2db001acd66870c965089c5cb6ebd97bc558038b64d98cce2dcd4'
output_ck_str='d1058f19e186caade82d2eb869c12987'
output_ik_str='7aba2fcc518ceafe7492d140ec7fb6e6'

# Third test
rand_str='9cfbf27abe8ce9c281c93f3dbf1bad2c'
sqn_str = '000000000421'
#
sqn_int = int.from_bytes(bytearray.fromhex(sqn_str),byteorder='big',signed=False)
print(sqn_int)
snni_b = snni_str.encode('ASCII')
rand_b = bytes.fromhex(rand_str)
vector = milenage.generate_m5gran_vector_alt(k_b,opc_b,sqn_int,snni_b,rand_b)
print('Vector:',vector)
print('Vector[0] (hex):',vector[0].hex())
#
output_ck_str='c38e6ead39c8a5c79bce6e8b1e7d8f54'
output_ik_str='a0b1b632211a3945450d81608abf7f63'
output_kausf_str='be479f1622d1db8343b35f109b4dee5688a68ca6268ddc89dce1f0c02ad1f482'

# 4th test
input = {'command': 'ping', 'source': 'udm', 'supi': 'imsi-999700000000001', 'amf': '8000', 'sqn': '000000000661', 'snn': '5G:mnc070.mcc999.3gppnetwork.org', 'rand': '268321d75352ff178f2547f3bf72a214'}
amf_b = bytes.fromhex(input['amf'])
sqn_int = int.from_bytes(bytes.fromhex(input['sqn']),byteorder='big',signed=False)
snn_b = input['snn'].encode('ASCII')
rand_b = bytes.fromhex(input['rand'])
print(amf_b)
print(sqn_int)
print(snn_b)
print(rand_b.hex(),len(input['rand']))
milenage = Milenage(amf_b)
vector = milenage.generate_m5gran_vector_alt(k_b,opc_b,sqn_int,snn_b,rand_b)
#
output_ik_str='68ce99f9df47c6782ad86c317acaf4f8'
output_ck_str='1789f1f7cc8cda128f5679b33533091e'
output_autn_str='894837527a3f8000436f8bfa299d9194'
output_xres_star_str='973bb2484dcc7468de2063fff2b1238f'
output_kausf_str='9c87ffc60bfd573128adb0406f0d1aa1eb5b3546b84213ac1d95a17f76a3bbc2'

