
# 2. Build and push the container image to Container Registry (GCR)
gcloud builds submit --tag gcr.io/cardiac-strainlabs-486917/custom-model-serving .

# 3. Create a Vertex AI Model using the custom container
gcloud ai models upload \
  --region=us-central1 \
  --display-name=cardiac-risk-custom-model \
  --container-image-uri=gcr.io/cardiac-strainlabs-486917/custom-model-serving \
  --container-health-route=/health \
  --container-predict-route=/predict \
  --container-ports=8080 \
  --artifact-uri=gs://cardiac-strainlabs-486917-models/

# 4. Deploy the model to an Endpoint
gcloud ai endpoints deploy-model $(gcloud ai endpoints list --region=us-central1 --filter="display_name=cardiac-risk-endpoint" --format="value(name)" | head -n 1) \
  --region=us-central1 \
  --model=$(gcloud ai models list --region=us-central1 --filter="display_name=cardiac-risk-custom-model" --format="value(name)" | head -n 1) \
  --display-name=cardiac-risk-custom-deployment \
  --machine-type=n1-standard-2 \
  --min-replica-count=1 \
  --traffic-split=0=100
