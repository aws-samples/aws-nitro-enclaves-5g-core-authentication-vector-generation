# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
from typing import Union
import json
import os
import logging
import boto3
logging.getLogger().setLevel(logging.INFO)
logger = logging.getLogger(__name__)


REGION = os.environ.get('region')
ssm_client = boto3.client('ssm',region_name=REGION)

def main(event, context):
    logger.debug(event)
    if event["detail"]["build-status"] == "SUCCEEDED":
        parameter_path = '/undefined/'
        if event["detail"]["project-name"].startswith('BuildOpen5gsArm64'):
            parameter_path = os.environ.get('open5gs_artifact_parameter')
        elif event["detail"]["project-name"].startswith('BuildOpen5gsEnclaveArm64'):
            parameter_path = os.environ.get('open5gs_enclave_artifact_parameter')
        elif event["detail"]["project-name"].startswith('BuildUeransimArm64'):
            parameter_path = os.environ.get('ueransim_artifact_parameter')

        artifact_location = event["detail"]["additional-information"]["artifact"]["location"]
        logger.info(f"Updating  {parameter_path} with {artifact_location}")
        try:
            result = ssm_client.put_parameter(
                Name=parameter_path,
                Value=artifact_location,
                Overwrite=True,
            )
            logger.info("Result of ssm put parameter")
            logger.info(result)
        except Exception as e:
            logger.error(e)

    return create_response(200, {})
    
def create_response(code: int, body: Union[dict, str]):
    json_content = {
        "statusCode": code,
    }
    return json_content

if __name__ == "__main__":
    main(None, None)
