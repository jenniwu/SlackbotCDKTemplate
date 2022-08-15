import axios from 'axios';
import querystring from 'querystring';
import { MessageMetadataEventPayloadObject } from '@slack/types';
import {
    APIGatewayProxyEvent,
    APIGatewayProxyResult
} from "aws-lambda/trigger/api-gateway-proxy";

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';
const HEADERS = {
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
    }
};

const keywordMatch = (text: any): string => {
    if (text.match(/\bray core\b/)) {
        return "Please check out our documentation about Ray Core at https://www.ray.io/ray-core";
    } else if (text.match(/(\bdataset)(s\b|\b)/)) {
        return "Please check out our documentation about Ray Datasets at https://www.ray.io/ray-datasets";
    } else if (text.match(/(\btune\b)|(\btuning\b)/)) {
        return "Please check out our documentation about Ray Tune at https://www.ray.io/ray-tune";
    } else if (text.match(/(\bserve\b)/)) {
        return "Please check out our documentation about Ray Serve at https://www.ray.io/ray-serve";
    } else if (text.match(/(\btrain\b)|(\btraining\b)/)) {
        return "Please check out our documentation about Ray Train at https://www.ray.io/ray-sgd";
    } else if (text.match(/(\blearning\b)/)) {
        return "Please check out our documentation about Ray Reinforcement Learning at https://www.ray.io/rllib";
    } else if (text.match(/^\bhi\b|\bhello\b|\bgood morning\b|\bhey\b$/)) {
        return "Hello!"
    }
}

const sendResponse = async (event: MessageMetadataEventPayloadObject) => {
    console.log(`Message ${event.ts} sent to channel: ${event.channel}`);
    const data = {
        token: BOT_TOKEN,
        channel: event.channel,
        thread_ts: event.ts,
        text: keywordMatch(event.text),
    };
    console.log(`Post body: ${JSON.stringify(data)}`);
    return axios.post(POST_MESSAGE_URL, querystring.stringify(data), HEADERS);
}

const handleRequest = async (params: any) => {
    const slackEvent = params.event;
    if (!slackEvent.bot_id) { // filter out messages from my own bot
        try {
            const { data } = await sendResponse(slackEvent);
            console.log(JSON.stringify(data, null, 4));
        } catch (error) {
            console.log(`Error: ${error}`);
        }
    }
}

const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const params = JSON.parse(event.body!);
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Request Body: ${JSON.stringify(params)}`);

    if (params.type == 'url_verification') {
        return {
            statusCode: 200,
            body: JSON.stringify(params.challenge),
        };
    } else if (params.type == 'event_callback') {
        handleRequest(params);
        return {
            statusCode: 200,
            body: 'OK',
        };
    }
};

exports.handler = lambdaHandler;
