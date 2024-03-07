# Deployment

```
CDK_DEFAULT_REGION=eu-central-1 cdk deploy --all --require-approval never
bin/push_buildspecs_to_s3.sh
bin/push_dockerfiles_to_s3.sh
```
