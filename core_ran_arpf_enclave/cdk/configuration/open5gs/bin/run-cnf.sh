#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
if [ $# -eq 2 ]; then
    echo "Use enclave-enabled binary"
fi

CNF=$1
CONFIG_DIR=/usr/local/etc/open5gs
PATCH_DIR=${CONFIG_DIR}/patch
# Get local IP address of ENI
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
ENI_IP=$(curl -s -H "X-aws-ec2-metadata-token: ${TOKEN}" http://169.254.169.254/1.0/meta-data/local-ipv4)
#ENI_IP=$(curl -s http://169.254.169.254/1.0/meta-data/local-ipv4)
echo ENI IP: $ENI_IP
#DB_ENDPOINT=$(aws docdb describe-db-clusters --query 'DBClusters[?DBClusterIdentifier==`open5gsdb2`].Endpoint' --output text)
#echo DB ENDPOINT: $DB_ENDPOINT
#DB_PASSWORD=$(aws ssm get-parameter --with-decryption --name /Open5gsDB/Password/open5gsAdmin --query 'Parameter.Value' --output text)
#DB_URI='mongodb:\/\/open5gsAdmin:'${DB_PASSWORD}'@'${DB_ENDPOINT}':27017\/open5gs\?replicaSet=rs0\&readPreference=secondaryPreferred\&retryWrites=false'
DB_URI='mongodb:\/\/udm.local\/open5gs' # Escaping the / for the use of sed below
echo DB URI: $DB_URI

# Get the configuration locally
cp ${CONFIG_DIR}/${CNF}.yaml .
# Patch the configuration
if [ -e ${PATCH_DIR}/${CNF}.yaml.patch ]; then
  patch -R ${CNF}.yaml ${PATCH_DIR}/${CNF}.yaml.patch
else
  echo "No patch file identified"
fi
# Replace the DB_URI
sed "s/REPLACE_DB_URI/$DB_URI/" -i ${CNF}.yaml
# Replace the ENI_IP
sed "s/REPLACE_ENI_IP/$ENI_IP/" -i ${CNF}.yaml

# Run the CNF
if [ $# -eq 2 ]; then
    /usr/local/enclave/bin/open5gs-${CNF}d -c ${CNF}.yaml
else
    /usr/local/bin/open5gs-${CNF}d -c ${CNF}.yaml
fi
