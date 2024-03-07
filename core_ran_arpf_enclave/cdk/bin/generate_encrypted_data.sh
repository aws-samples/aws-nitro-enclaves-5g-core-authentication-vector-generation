#!/bin/bash

DEFAULT_REGION=$(aws configure get region)
APPLICATION_NAME='EnclaveArpf'

REGION=$DEFAULT_REGION
HostName=''
InstanceId=''

get_instance_id () {
    InstanceId=$(aws ec2 describe-instances --region ${REGION} --filters "Name=instance-state-name,Values=running" "Name=tag:ApplicationName,Values=${APPLICATION_NAME}" "Name=tag:HostName,Values=${1}" --query "Reservations[].Instances[].InstanceId" --output text)
}
get_status () {
    CommandStatus=$(aws ssm get-command-invocation --region ${REGION} --command-id ${1} --instance-id ${2} --query "Status" --output text)
    echo $CommandStatus
}
encrypt_data () {
    echo "Encrypt data and upload to S3 on ${HostName} (${REGION})"
    CommandId=$(aws ssm send-command \
                    --region ${REGION} \
                    --instance-ids "${InstanceId}" \
                    --document-name "AWS-RunShellScript" \
                    --comment "Run commands to encrypt data and upload to S3" \
                    --parameters '{"commands":["sudo -u ec2-user bash -c \"cd /home/ec2-user/ && encrypt_subscriber_data.sh && put-encrypted-subscriber-data-to-s3.sh\" "]}' \
                    --output text \
                    --query "Command.CommandId")
    Status=$(get_status ${CommandId} ${InstanceId})
    echo $CommandId "$Status"
    if [ "$Status" == "Failed" ]; then
        return
    fi
    while [ "$Status" != "Success" ]; do
        sleep 1
        Status=$(get_status ${CommandId} ${InstanceId})
        echo $CommandId "$Status"
        if [ "$Status" == "Failed" ]; then
            return
        fi
    done
}


HostName=management
get_instance_id $HostName
echo $HostName $InstanceId
encrypt_data
