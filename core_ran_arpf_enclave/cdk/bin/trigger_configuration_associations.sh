#!/bin/bash

ASSOCIATION_NAME=EnclaveArpfAssociation
REGION=$(aws configure get region)
echo $REGION
ASSOCIATION_ID=$(aws ssm list-associations --region $REGION --association-filter-list "key=Name,value=AWS-ApplyAnsiblePlaybooks" "key=AssociationName,value=${ASSOCIATION_NAME}" --query "Associations[].AssociationId" --output text)
echo $ASSOCIATION_ID
aws ssm start-associations-once  --region $REGION --association-ids $ASSOCIATION_ID | jq -r
