# A 5G Network with AWS Nitro Enclaves Authentication Credential Repository and Processing Function

This project demonstrates how to deploy a 3GPP Authentication Credential Repository and Processing Function (ARPF) running within an AWS Nitro Enclaves.



## Preqrequisites for Installation

- [ ] [AWS Account](https://signin.aws.amazon.com/signin?redirect_uri=https%3A%2F%2Fportal.aws.amazon.com%2Fbilling%2Fsignup%2Fresume&client_id=signup)
- [ ] [AWS Command Line Interface (CLI)](https://aws.amazon.com/cli/)
- [ ] [AWS Cloud Development Kit (CDK)](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html)
- [ ] [The jq command-line JSON processor](https://jqlang.github.io/jq/)

## Installation Instructions

### Bootstrap the AWS CDK Environment

Before AWS CDK apps can be deployed in your AWS environment, you must provision preliminary resources. This process is called [bootstrapping](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html):

Clone the git repository, change directory, and bootstrap
```bash
ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text)
echo AWS Account number: ${ACCOUNT}
REGION=$(aws configure get region)
echo Default AWS Region: ${REGION}
APPLICATION=ArpfEnclave
cdk bootstrap aws://${ACCOUNT}/${REGION} -t Application=${APPLICATION}
```

### Deploy the AWS CDK App to build the software binaries and AMI

[AWS CodeBuild](https://docs.aws.amazon.com/codebuild/latest/userguide/welcome.html) is used to automate the compilation of the [Open5gs](https://github.com/open5gs/open5gs) and [UERANSIM](https://github.com/aligungr/UERANSIM) binaries. AWS CodeBuild is a fully managed build service in the cloud. CodeBuild eliminates the need to provision, manage, and scale your own build servers. Once compilation is complete, the binaries are stored in an Amazon S3 bucket. [EC2 Image Builder](https://docs.aws.amazon.com/imagebuilder/latest/userguide/what-is-image-builder.html) then fetches the binaries and integrate them with further artefacts into a custom AMI ready to be deployed. EC2 Image Builder is a fully managed AWS service that helps you to automate the creation, management, and deployment of customized, secure, and up-to-date server images. For building secure AMIs and container images, EC2 Image Builder creates [Image pipelines](https://docs.aws.amazon.com/imagebuilder/latest/userguide/what-is-image-builder.html#image-builder-concepts).

From the root of the repository, run the following commands to deploy the CDK app and its stacks
```bash
AMI_PIPELINE_DIR=ami_build_pipeline
cd ${AMI_PIPELINE_DIR}/cdk
npm install
cdk synth
cdk deploy CodebuildVpcStack, CodebuildCoreRanStack --require-approval never
bin/push_buildspecs_to_s3.sh codebuild
bin/push_dockerfiles_to_s3.sh
cdk deploy ImageBuilderCoreRanStack --require-approval never
```

### Deploy the AWS CDK App to build the Enclave image file and AMI
A second EC2 Image Builder pipeline is created to build the Enclave image file, store the related PCR measurement in [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html), and finally build an AMI containing the Enclave image file and further artefacts.

From the root of the repository, run the following commands to deploy the CDK app and its stacks
```bash
ENCLAVE_PIPELINE_DIR=enclave_build_pipeline
cd ${ENCLAVE_PIPELINE_DIR}/cdk
npm install
cdk synth
bin/push_artefacts_to_s3.sh
cdk deploy ImageBuilderEnclaveStack --require-approval never
```

### Build the AMIs

The AMIs have to be built before you can deploy the 5G Core. Compilation of the software and creation of the AMI will take around 45 minutes.

From the root of the repository, run the following command to trigger the compilation of the software binaries and of [AWS Nitro Enclave SDK](https://github.com/aws/aws-nitro-enclaves-sdk-c/). The AWS Nitro Enclave SDK is a prerequisite to build the Enclave image file
```bash
utils/bin/trigger_artefacts_build.sh
```
You can check the status of the software binaries build processes using
```bash
utils/bin/check_artefacts_build_status.sh
```
This is a wrapper around the AWS CLI for EC2 Image Builder and CodeBuild, that will return `SUCCEEDED` or `AVAILABLE` when compilation terminates successfully.

When complete, build the AMIs. The generation of the Enclave image file will take place during the build of the AMI for the parent instance.
```bash
utils/bin/trigger_images_build.sh
```
You can check the status of the AMI build processes using
```bash
utils/bin/check_images_build_status.sh
```
Compiling the software and then creating the AMIs takes some time. You can already proceed with the next two steps.

### Deploy the AWS CDK App to automate configuration management

We are using [AWS Systems Manager State Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-state.html) with [associations that run Ansible playbooks](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-state-manager-ansible.html) to automate runtime configuration tasks of the EC2 instances. These runtime configuration tasks comprise the deployment of Amazon CloudWatch agent configuration files, of the Open5gs configuration files and related scripts, and of scripts to manage the life-cycle of the Enclaves.

From the root of the repository, run the following commands to deploy the CDK app and its stacks
```bash
CONFIGURATION_DEPLOYMENT_DIR=configuration_deployment_automation
cd ${CONFIGURATION_DEPLOYMENT_DIR}/cdk
npm install
cdk synth
cdk deploy ConfigurationAssociationAutomation --require-approval never
```

### Deploy the AWS Systems Manager Session Document

[Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html) is an AWS Systems Manager capability. We are using Session Manager to securely access EC2 instances for development purpose and for interactive demo sessions. Session manager configuration is controlled by a [session document](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-schema.html). We will deploy this session document before using Session manager

From the root of the repository, run the following command to create a session document from the `session_document.yaml` file:
```bash
SESSION_DOCUMENT_NAME=SessionRegionalSettings
aws ssm create-document --content file://utils/ssm/session_manager/session_document.yaml --document-type "Session" --name ${SESSION_DOCUMENT_NAME} --document-format YAML --region ${REGION}
```

### Deploy the AWS CDK App to deploy the 5G Core and RAN with ARPF running within AWS Nitro Enclaves

Now that the AMI is available and the infrastructure for automation is
in place, we can deploy the 5G Core, with the ARPF running within
Nitro Enclaves, and the RAN.

From the root of the repository, run the following commmand to synthetize the application
```bash
APPLICATION_DIR=core_ran_arpf_enclave
cd ${APPLICATION_DIR}/cdk
npm install
cdk synth
```
And push the configuration to the S3 bucket for configuration
```bash
bin/push_configuration_to_s3.sh
```
Then deploy the stacks to instantiate the VPCs used by the 5G Core and RAN and to support encryption. This deployment will create a KMS key used for encryption of the subscriber database used in the ARPF
```bash
cdk deploy EnclaveArpfVpcStack EnclaveArpfBucketStack EnclaveArpfKeyInfrastructureStack --require-approval never
```
Next you will deploy only the management instance. The management instance is used to simulate a dedicated host used to perform client-side envelope encryption of the subscriber database used in the ARPF
```bash
cdk deploy EnclaveArpfManagementStack  --require-approval never
```
Once the management host is deployed, update the KMS key policy to let the management host perform encryption and decryption operation
```bash
bin/update-key-policy-for-management-host.sh
```
And run the following script to encrypt the subscriber database on the management host, have it pushed to an S3 bucket. This will allow for the ARPF nodes to pull the encrypted database when starting the Enclave.
```bash
bin/generate_encrypted_data.sh
```
Finally, deploy the instances supporting the 5G Core and the RAN.
```bash
cdk deploy EnclaveArpfCoreRanStack EnclaveArpfArpfEnclaveShardsStack --require-approval never
```
And update the key policy once more to allow for the Enclaves to decrypt the subscriber database
```bash
bin/update-key-policy.sh
```
Your 5G Core is ready to be started and experimented with!

Thanks to the state manager association deployed for parent instances of the Nitro Enclaves, the Nitro Enclave running the ARPF is automatically started when the parent instance is operational.

### Start and stop the 5G Core

For this section, make sure you change directory to `core_ran_arpf_enclave/cdk`.

To start the 5G Core and RAN, with the ARPF deployed in Nitro Enclaves, run the following script
```bash
bin/run_ran_enclave_core.sh
```
This script will start all the 5G Core network functions (the ARPF is already running), along with the RAN gNB and UE. Once the UE is operational, an `iperf3` session is started from the UE to the UPF to generate traffic (over the 3GPP N3 and N6 interfaces).
To stop the 5G Core and RAN, run the following script
```bash
bin/stop_ran_core.sh
```
If you want to start the 5G Core and RAN without the ARPF deployed in Nitro Enclaves, use the `bin/run_ran_core.sh` script instead.

The script `bin/restart_ran.sh` can be used to restart the RAN only.

## Validate your Deployment

For this section, make sure you change directory to `core_ran_arpf_enclave/cdk`.

To get the list of running instances (AWS CLI)
* Run
  ```bash
  bin/connect-to-intance-via-ssm-session.sh list
  ```
* The output should show
  ```bash
  Available instances:
  amf arpf arpf management nrf ran udm upf
  ```
  There are two `arpf` instances because of the [autoscaling group](https://docs.aws.amazon.com/autoscaling/ec2/userguide/auto-scaling-groups.html) deployment.

To validate that the `iperf3` session is running (console):
* Open the [Amazon CloudWatch console](https://console.aws.amazon.com/cloudwatch/home)
* In the navigation pane, under **Metrics**, choose **All metrics**
* On the **Browse tab**, in the **Custom namespaces** section, choose **Open5g/InstanceMetrics**
* Then choose **ImageId, InstanceId, InstanceType, interface**
* In the search box, enter "ogstun" and "net_bytes_recv". The **Instance name** column should display **UPF**
* Select the checkbox to display the metric in the graph

The Open5gs UDM network function displays logs related to communication with the ARPF running in the Nitro Enclaves. To see the logs generated by the Open5gs network functions (console)
* Open the [Amazon CloudWatch console](https://console.aws.amazon.com/cloudwatch/home)
* In the navigation pane, under **Logs**, choose **Log groups**
* In the search box, enter "open5gs"
* Choose **/ec2/instances/var/log/open5gs/udm.log**
* On the **Log streams tab**, choose the available **Log stream**
* In the search box to filter events, enter **Status** to filter events related to communication between the UDM and the ARPF running in the Nitro Enclaves


The ARPF is running within a Nitro Enclave on the parent instances. There is a proxy, running on TCP port 8012, that allows for commands to be sent to the ARPF within the Nitro Enclave. The parent instances belong to an EC2 Autoscaling group and are reachable via an AWS NLB, on TCP port 8012. To validate that the UDM network function can communicate with the Nitro Enclaves running in the ARPF instances behind the AWS NLB. The NLB is configured with the DNS alias `arpf.local`.
* Connect to the UDM instance: run the following command
  ```bash
  bin/connect-to-intance-via-ssm-session.sh udm
  ```
  You are now connected to the UDM instance
* To check connectivity to an ARPF running within a Nitro Enclave, run the following command
  ```bash
  echo -n '{ "command":"ping" }' | socat - tcp-connect:arpf.local:8012
  ```
  The output should show
  ```bash
  {"Status": "success", "Response": "pong"}
  ```
* To disconnect from the UDM instance, enter **Ctrl+D** **Ctrl+D** (twice)

## Diving Deeper on the Nitro Enclaves ARPF Implementation

See our blog post at TBA.

## Alternative Implementation of ARPF deployment with AWS Application Load Balancer

See our blog post at TBA for details. To deploy it, run
```bash
APPLICATION_DIR=core_ran_arpf_enclave
cd ${APPLICATION_DIR}/cdk
cdk deploy EnclaveArpfArpfEnclaveShardsStack --require-approval never
bin/update-key-policy-for-shards.sh
```

## Cleanup

Run the following script from the root of the repository
```bash
./uninstall.sh
```
