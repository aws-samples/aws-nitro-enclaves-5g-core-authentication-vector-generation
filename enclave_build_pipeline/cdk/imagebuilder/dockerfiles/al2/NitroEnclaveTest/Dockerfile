# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# docker build ./ -t "nitro_enclave_test"
# docker run --rm -it --name test nitro_enclave_test
# nitro-cli build-enclave  --docker-uri nitro_enclave_test --output-file test.eif
# nitro-cli run-enclave --eif-path test.eif --cpu-count 2 --enclave-cid 12 --memory 2200 --debug-mode
# This is the enclave image

# FROM nitro_enclaves_base
#FROM {{{ imagebuilder:parentImage }}} as BUILD
FROM {{{ imagebuilder:parentImage }}}
{{{ imagebuilder:environments }}}
{{{ imagebuilder:components }}}

# Install python for running the server and net-tools for modifying network config
RUN yum install python3 iproute -y
ENV LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/app

WORKDIR /app
#COPY --from=BUILD /usr/local/bin/run.sh ./ # Copied by the component earlier
RUN ls /app/
RUN chmod +x /app/run.sh
CMD ["/app/run.sh"]
