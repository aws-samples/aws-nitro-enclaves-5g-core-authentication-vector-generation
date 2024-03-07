# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# docker build ./ -t "nitro_enclave_arpf_server"
# docker run --rm -it  --name arpf_server nitro_enclave_arpf_server
# nitro-cli build-enclave  --docker-uri nitro_enclave_arpf_server --output-file arpf.eif
# nitro-cli run-enclave --eif-path arpf.eif --cpu-count 2 --enclave-cid 12 --memory 2400 --debug-mode

FROM {{ imagebuilder:parentImage }} as BUILD_NITRO_ENCLAVES_SDK

RUN yum upgrade -y
RUN amazon-linux-extras enable epel
RUN yum clean -y metadata && yum install -y epel-release
RUN yum install -y \
    	cmake3 \
	gcc \
	git \
	tar \
	make \
	gcc-c++ \
	go \
	ninja-build \
	doxygen
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal --default-toolchain 1.63

# RUN yum install -y quilt

# We keep the build artifacts in the -build directory
WORKDIR /tmp/crt-builder

RUN git clone --depth 1 -b v0.4.0  https://github.com/aws/aws-nitro-enclaves-sdk-c

RUN git clone --depth 1 -b v1.12.0 https://github.com/awslabs/aws-lc.git aws-lc
RUN cmake3 -DCMAKE_PREFIX_PATH=/usr -DCMAKE_INSTALL_PREFIX=/usr -GNinja -DBUILD_TESTING=0 -S aws-lc -B aws-lc/build .
RUN go env -w GOPROXY=direct
RUN cmake3 --build aws-lc/build --parallel $(nproc) --target install

RUN git clone --depth 1 -b v1.3.46 https://github.com/aws/s2n-tls.git
RUN cmake3 -DCMAKE_PREFIX_PATH=/usr -DBUILD_TESTING=0 -DCMAKE_INSTALL_PREFIX=/usr -S s2n-tls -B s2n-tls/build
RUN cmake3 --build s2n-tls/build --parallel $(nproc) --target install

RUN git clone --depth 1 -b v0.8.0 https://github.com/awslabs/aws-c-common.git
RUN cmake3 -DCMAKE_PREFIX_PATH=/usr -DBUILD_TESTING=0 -DCMAKE_INSTALL_PREFIX=/usr -GNinja -S aws-c-common -B aws-c-common/build
RUN cmake3 --build aws-c-common/build --parallel $(nproc) --target install

RUN git clone --depth 1 -b v0.1.2 https://github.com/awslabs/aws-c-sdkutils.git
RUN cmake3 -DCMAKE_PREFIX_PATH=/usr -DBUILD_TESTING=0 -DCMAKE_INSTALL_PREFIX=/usr -GNinja -S aws-c-sdkutils -B aws-c-sdkutils/build
RUN cmake3 --build aws-c-sdkutils/build --parallel $(nproc) --target install

RUN git clone --depth 1 -b v0.5.18 https://github.com/awslabs/aws-c-cal.git
RUN cmake3 -DCMAKE_PREFIX_PATH=/usr -DBUILD_TESTING=0 -DCMAKE_INSTALL_PREFIX=/usr -GNinja -S aws-c-cal -B aws-c-cal/build
RUN cmake3 --build aws-c-cal/build --parallel $(nproc) --target install

RUN git clone --depth 1 -b v0.11.0 https://github.com/awslabs/aws-c-io.git
RUN cmake3 -DUSE_VSOCK=1 -DCMAKE_PREFIX_PATH=/usr -DBUILD_TESTING=0 -DCMAKE_INSTALL_PREFIX=/usr -GNinja -S aws-c-io -B aws-c-io/build
RUN cmake3 --build aws-c-io/build --parallel $(nproc) --target install

RUN git clone --depth 1 -b v0.2.14 http://github.com/awslabs/aws-c-compression.git
RUN cmake3 -DCMAKE_PREFIX_PATH=/usr -DBUILD_TESTING=0 -DCMAKE_INSTALL_PREFIX=/usr -GNinja -S aws-c-compression -B aws-c-compression/build
RUN cmake3 --build aws-c-compression/build --parallel $(nproc) --target install

RUN git clone --depth 1 -b v0.7.6 https://github.com/awslabs/aws-c-http.git
RUN cmake3 -DCMAKE_PREFIX_PATH=/usr -DBUILD_TESTING=0 -DCMAKE_INSTALL_PREFIX=/usr -GNinja -S aws-c-http -B aws-c-http/build
RUN cmake3 --build aws-c-http/build --parallel $(nproc) --target install

RUN git clone --depth 1 -b v0.6.15 https://github.com/awslabs/aws-c-auth.git
RUN cmake3 -DCMAKE_PREFIX_PATH=/usr -DBUILD_TESTING=0 -DCMAKE_INSTALL_PREFIX=/usr -GNinja -S aws-c-auth -B aws-c-auth/build
RUN cmake3 --build aws-c-auth/build --parallel $(nproc) --target install

RUN git clone --depth 1 -b json-c-0.16-20220414 https://github.com/json-c/json-c.git
RUN cmake3 -DCMAKE_PREFIX_PATH=/usr -DBUILD_TESTING=0 -DCMAKE_INSTALL_PREFIX=/usr -DBUILD_SHARED_LIBS=OFF -GNinja -S json-c -B json-c/build
RUN cmake3 --build json-c/build --parallel $(nproc)  --target install

RUN git clone --depth 1 -b v0.4.0 https://github.com/aws/aws-nitro-enclaves-nsm-api.git
RUN source $HOME/.cargo/env && cd aws-nitro-enclaves-nsm-api && cargo build --release --jobs $(nproc) -p nsm-lib
RUN mv aws-nitro-enclaves-nsm-api/target/release/libnsm.so /usr/lib64
RUN mv aws-nitro-enclaves-nsm-api/target/release/nsm.h /usr/include

RUN cmake3 -DCMAKE_PREFIX_PATH=/usr -DCMAKE_INSTALL_PREFIX=/usr -GNinja \
	-S aws-nitro-enclaves-sdk-c -B aws-nitro-enclaves-sdk-c/build
RUN cmake3 --build aws-nitro-enclaves-sdk-c/build --parallel $(nproc) --target install
RUN cmake3 --build aws-nitro-enclaves-sdk-c/build --parallel $(nproc) --target docs

# Create a base image with libnsm.so and kmstool_enclave_cli
FROM {{ imagebuilder:parentImage }} as NITRO_ENCLAVES_BASE
WORKDIR /app
COPY --from=BUILD_NITRO_ENCLAVES_SDK /usr/lib64/libnsm.so /usr/lib64/libnsm.so /app/
COPY --from=BUILD_NITRO_ENCLAVES_SDK /usr/bin/kmstool_enclave_cli /app/


FROM {{ imagebuilder:parentImage }} as BUILD_SOCAT

WORKDIR src
RUN yum install -y tar gzip gcc make
RUN curl -s --location http://www.dest-unreach.org/socat/download/socat-1.7.4.4.tar.gz | tar xfz - -C .
WORKDIR socat-1.7.4.4
RUN ./configure
RUN make

# This is the Nitro Enclaves SDK image
FROM NITRO_ENCLAVES_BASE
{{{ imagebuilder:environments }}}
{{{ imagebuilder:components }}}

# Install python for running the server and net-tools for modifying network config
RUN yum install python3 python3-requests python3-urllib3 python3-jmespath openssl11 iproute -y
ENV LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/app

WORKDIR /app
#COPY requirements.txt ./
RUN pip3 install -r /app/requirements.txt
COPY --from=BUILD_SOCAT src/socat-1.7.4.4/socat ./
#COPY --from=att-doc-retriever /app/att_doc_retriever_sample ./

#COPY gggpp_crypto/milenage.py gggpp_crypto/lte.py ./gggpp_crypto/
#COPY application_server.py ./
#COPY run.sh ./

RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]
