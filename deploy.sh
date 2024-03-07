#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

APPLICATION_DIR=core_ran_arpf_enclave

cd ${APPLICATION_DIR}/cdk

bin/push_configuration_to_s3.sh # For the association, can be triggered with bin/trigger_configuration_association.sh
cdk deploy EnclaveArpfVpcStack EnclaveArpfBucketStack EnclaveArpfKeyInfrastructureStack --require-approval never
cdk deploy EnclaveArpfManagementStack  --require-approval never
bin/update-key-policy-for-management-host.sh
bin/generate_encrypted_data.sh # On the management host: encrypt_subscriber_data.sh && put-encrypted-subscriber-data-to-s3.sh
cdk deploy EnclaveArpfCoreRanStack --require-approval never
bin/update-key-policy.sh

cd ${CURRENT_DIR}
