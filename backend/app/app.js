// backend/app.js (SSM-based communication)

const express = require('express');
const cors = require('cors');
const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');
const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const REGION = 'eu-central-1';
const ssmClient = new SSMClient({ region: REGION });
const ec2Client = new EC2Client({ region: REGION });

async function getMongoInstanceId() {
  const command = new DescribeInstancesCommand({
    Filters: [
      { Name: 'tag:Name', Values: ['terraform-mongodb'] },
      { Name: 'instance-state-name', Values: ['running'] }
    ]
  });

  const response = await ec2Client.send(command);
  const instance = response.Reservations?.[0]?.Instances?.[0];
  if (!instance) throw new Error('No MongoDB instance found');
  return instance.InstanceId;
}

async function queryMongoViaSSM(name) {
  const instanceId = await getMongoInstanceId();

  const sendCmd = new SendCommandCommand({
    DocumentName: 'AWS-RunShellScript',
    InstanceIds: [instanceId],
    Parameters: {
      commands: [`mongosh --quiet --eval 'JSON.stringify(db.people.findOne({ name: "${name}" }))'`]
    },
    CloudWatchOutputConfig: {
      CloudWatchLogGroupName: '/mongo/queries',
      CloudWatchOutputEnabled: false
    }
  });

  const { Command } = await ssmClient.send(sendCmd);

  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const result = await ssmClient.send(new GetCommandInvocationCommand({
      CommandId: Command.CommandId,
      InstanceId: instanceId
    }));

    if (result.Status === 'Success') {
      try {
        return JSON.parse(result.StandardOutputContent || '{}');
      } catch (e) {
        throw new Error('Invalid JSON returned from mongosh');
      }
    } else if (result.Status === 'Failed' || result.Status === 'Cancelled') {
      throw new Error(`Command failed: ${result.StatusDetails}`);
    }
  }

  throw new Error('Timeout waiting for SSM command result');
}

app.post('/query', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await queryMongoViaSSM(name);
    res.json(result || {});
  } catch (err) {
    res.status(500).json({ error: 'SSM query failed', detail: err.message });
  }
});

app.listen(3000, () => {
  console.log('Backend listening on port 3000 (SSM mode)');
});
