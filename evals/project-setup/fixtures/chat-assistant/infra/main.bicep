// Container app for the staff assistant. The model endpoint is private to the virtual network.
param location string = resourceGroup().location
param modelEndpoint string

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'staff-assistant'
  location: location
  properties: {
    template: {
      containers: [
        {
          name: 'api'
          image: 'staff-assistant:latest'
          env: [
            { name: 'MODEL_ENDPOINT', value: modelEndpoint }
            { name: 'MODEL_API_KEY', secretRef: 'model-api-key' }
          ]
        }
      ]
    }
  }
}
