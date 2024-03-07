#!/bin/bash

# Following https://docs.aws.amazon.com/systems-manager/latest/userguide/walkthrough-cli.html

DEFAULT_REGION=$(aws configure get region)
RAN_HOSTS=(ran)
RAN_HOSTS_CLASS=(ran-ue)
APPLICATION_NAME='EnclaveArpf'

REGION=${DEFAULT_REGION}
HostName=''
InstanceId=''

get_instance_id () {
    InstanceId=$(aws ec2 describe-instances --region ${REGION} --filters "Name=instance-state-name,Values=running" "Name=tag:ApplicationName,Values=${APPLICATION_NAME}" "Name=tag:HostName,Values=${1}" --query "Reservations[].Instances[].InstanceId" --output text)
}
get_status () {
    CommandStatus=$(aws ssm get-command-invocation --region ${REGION} --command-id ${1} --instance-id ${2} --query "Status" --output text)
    echo $CommandStatus
}
print_failed_debug () {
    echo aws ssm --region ${REGION} get-command-invocation --command-id $1 --instance-id $2
}
terminate_cnf () {
    echo "Terminate tmux session ${1} on ${HostName} (${REGION})"
    CommandId=$(aws ssm send-command \
                    --region ${REGION} \
                    --instance-ids "${InstanceId}" \
                    --document-name "AWS-RunShellScript" \
                    --comment "Stop tmux session and related commands" \
                    --parameters '{"commands":["sudo -u ec2-user bash -c \"cd /home/ec2-user/ && sh stop-'${1}'.sh\" "]}' \
                    --output text \
                    --query "Command.CommandId")
    Status=$(get_status ${CommandId} ${InstanceId})
    echo $CommandId "$Status"
    if [ "$Status" == "Failed" ]; then
        print_failed_debug ${CommandId} ${InstanceId}
        return
    fi
    while [ "$Status" != "Success" ]; do
        sleep 1
        Status=$(get_status ${CommandId} ${InstanceId})
        echo $CommandId "$Status"
        if [ "$Status" == "Failed" ]; then
            print_failed_debug ${CommandId} ${InstanceId}
            return
        fi
    done
}

for i in ${!RAN_HOSTS[@]}; do
    HostName=${RAN_HOSTS[i]}
    get_instance_id $HostName
    echo $HostName $InstanceId
    terminate_cnf ${RAN_HOSTS_CLASS[i]}
done

HostName=upf
get_instance_id $HostName
echo $HostName $InstanceId
terminate_cnf $HostName

HostName=amf
get_instance_id $HostName
echo $HostName $InstanceId
terminate_cnf $HostName

HostName=udm
get_instance_id $HostName
echo $HostName $InstanceId
terminate_cnf $HostName

HostName=nrf
get_instance_id $HostName
echo $HostName $InstanceId
terminate_cnf $HostName
