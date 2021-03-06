# Emulator

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![Build Status](https://travis-ci.org/serverless/emulator.svg?branch=master)](https://travis-ci.org/serverless/emulator)

[Website](http://www.serverless.com) • [Newsletter](http://eepurl.com/b8dv4P) • [Gitter](https://gitter.im/serverless/serverless) • [Forum](http://forum.serverless.com) • [Meetups](https://github.com/serverless-meetups/main) • [Twitter](https://twitter.com/goserverless)

> Emulate your Serverless functions locally.


## Contents

- [Getting started](#getting-started)
- [Development](#development)
- [Functionality](#functionality)
  + [General](#general)
  + [Function deployment](#function-deployment)
    + [Function config / `function.json`](#function-config--functionjson)
  + [Function invocation](#function-invocation)
  + [Middlewares](#middlewares)
- [APIs](#apis)
  + [HTTP API](#http-api)
    + [Functions](#functions)
      + [Deploy function](#deploy-function)
      + [Invoke function](#invoke-function)
    + [Utils](#utils)
      + [Heartbeat](#heartbeat)

---

## Getting started

1. Clone the repository
1. Run `npm install` to install all dependencies
1. Run `scripts/sync-storage` to sync the [example `storage` artifacts](./storage) with the Emulators `storage` location
1. Run `npm run build` to build the project (the build artifacts can be found in `dist`)
1. Run `npm start` to start the emulator

## Development

You can run `npm run watch` to automatically re-build the files in the `src` directory when they change.

Additionally you can use Docker to run and develop everything inside a container.

Spinning up the Docker container is as easy as `docker-compose run -p 4002:4002 node bash`. Make sure to run the steps in [Getting started](#getting-started).

Or, if you need a build a Docker image and run it, do:

```
docker build -t emulator .
docker run --rm -it -p 4002:4002 emulator
```

## Using the Emulator

The following documents provide some insights on how to configure and use the Emulator.

### Options

The Emulator can be configured with the following options you can pass in via the CLI:

- `--port` - `number` - Optional port (defaults to `4002`)

### Starting the Emulator

| Command | Description |
| --- | --- |
| `npm start` | Will start the Emulator at `localhost` with the default port |
| `npm start -- --port 4711` | Starts the Emulator at `localhost` with the port `4711` |

## Functionality

### General

The Emulator is a software which makes it possible to emulate different cloud provider FaaS offerings (such as AWS Lambda or Google Cloud Functions) on your local machine in an offline-focused manner.

It can be used to deploy and invoke serverless functions w/o the need to go through the process of setting up and configuring a cloud provider account or deploying the functions into the infrastructure before being able to use them.

This enables new ways of doing offline-first serverless development with a way faster feedback loop.

Technically speaking the Emulator is a long running process (Daemon) which exposes an API and accepts different calls to API endpoints in order to perform actions and control its behavior.

**Note:** The API is only used to control the Emulator. It is **NOT** the same as an API Gateway.

### Function deployment

Functions are deployed via the [API](#apis) and are stored in the `~/.serverless/emulator` directory according to the following filesystem structure:

```
|__ storage
    |__ functions
        |__ <function-id>
            |__ code
            |__ function.json
```

The root directory is the `storage` directory. It's a place where all artifacts will be stored.

The `functions` directory is the place where all the function-related artifacts are stored.

A directory for the specific service contains directories for each individual function.

The `code` directory is the place where the actual (unzipped) function code is stored.

The `function.json` file contains important information about the function configuration (e.g. what `runtime` this function uses or which `provider` it's written for) and other metadata.

The proposed directory structure makes it easy for the Emulator to follow a convention-over-configuration approach where artifacts are stored in a predictable way without having to introduce a local DB with state information about all the deployed functions and services.

On every function deployment the following happens behind the scenes:

- For every `function-id` a separate directory will be created (if not already present)
- The `.zip` file will be extracted and moved into the `code` directory
- The `function` configuration which is passed in via the API will be written into the `function.json` file

#### Function config / `function.json`

Every function needs information about its configuration. This information is passed in via the API when the function is deployed.

Upon deployment this data is persisted in the `function.json` file.

The `function.json` files can be found in `~/.serverless/emulator/storage/functions/<function-id>`.

The Emulator needs those file to e.g. make decision which [middlewares](#middlewares) to execute or which runtime-specific wrapper to use.

Here's a list with different example functions and their corresponding provider-related `function.json` config files:

- [Example AWS function](./examples/functions/my-service-function-aws-1)
- [Example Google function](./examples/functions/my-service-function-google-1)

### Function invocation

When invoking a function the Emulator will simply look for the function directory (see above how the naming schema helps with the lookup), determines the `provider`, `runtime` and `handler` based on the config in the `function.json` file and starts the execution phase which will happen in a dedicated child process (more on that later).

The invocation data is extracted from the incoming API requested and passed to a so-called runtime-specific "wrapper script" via `stdin`. This "wrapper script" is responsible to setup the execution environment, require the function and pass the event payload to the function (you can think of it as a language specific container). Furthermore it will marshall the returned data and pass it back to the Emulators parent process which will then transform it into a JSON format and sends it back via an API response.

The whole invocation happens in a `child_process.spawn()` call to ensure that the Emulator won't crash when a function misbehaves.

This abstraction layer makes it easy to introduce other runtimes later on. Furthermore the way the incoming event data is handled by the Emulator is always the same and independent of the function handler signature since the wrapper encapsulates the logic to marshall and unmarshall the data which is handed over to the function.

Here's a sample call to invoke an AWS function within the wrapper script (which is written in Node.js). It will require and prepare the function (according to the CLI `options`) and pass the echoed data as the function parameters (via `stdin`) to it:

```bash
# NOTE: This is not the actual payload. It's used to show the technical parts / architecture of a function invocation

echo '{ event: { foo: "bar" }, context: {}, callback: (error, result) => {} }' | runtimes/node.js <full-path-to-function-file> <exported-function-name>
```

### Middlewares

The Emulator provides a middleware concept which makes it possible to use custom code to modify the data which is used inside the Emulator when exercising core logic (e.g. setting up the execution environment, invoking functions, etc.).

The core Emulators `runMiddlewares` functionality ensures that the raw data object which is passed into it will be copied over into an `input` object and removed from the root of the object. Furthermore it creates a blank `output` object which can be used by middlewares to store the computed results.

Let's take a quick look at an example to see how this works behind the scenes.

We assume that the data which is passed into the Emulators `runMiddlewares` function has the following shape:

```javascript
{
  foo: 'bar',
  baz: 'qux'
};
```

The data will be prepared and passed into the middlewares in the following format:

```javascript
{
  input: {
    foo: 'bar',
    baz: 'qux'
  },
  output: {}
}
```

Middlewares can do whatever they want with this data.

However the computed result should be written into the `output` object since this is returned by the Emulators `runMiddlewares` function after all middlewares are executed.

Middlewares can be implemented against different lifecycle events. Right now the lifecycle events are:

<table>
  <tr>
    <th>Lifecycle</th>
    <th>Description</th>
    <th>Provided object</th>
    <th>Expected returned object</th>
  </tr>
  <tr>
    <td>
      <code>preLoad</code>
    </td>
    <td>
      Before the function is loaded and the execution environment is configured.
    </td>
    <td>
      <code>
        {
          input: {
            functionId <string>,
            functionConfig: <object>
          },
          output: {}
        }
      </code>
    </td>
    <td>
      <code>
        {
          input: {
            // ...snip...
          },
          output: {
            functionId: <string>,
            env: <object>
          }
        }
      </code>
    </td>
  </tr>
  <tr>
    <td>
      <code>postLoad</code>
    </td>
    <td>
      After the function was loaded and the execution environment was configured.
    </td>
    <td>
      <code>TBD</code>
    </td>
    <td>
      <code>TBD</code>
    </td>
  </tr>
  <tr>
    <td>
      <code>preInvoke</code>
    </td>
    <td>
      Right before the payload is passed to the function which should be invoked.
    </td>
    <td>
      <code>
        {
          input: {
            functionId: <string>,
            functionConfig: <object>,
            payload: <object>
          },
          output: {}
        }
      </code>
    </td>
    <td>
      <code>
        {
          input: {
            // ...snip...
          },
          output: {
            // NOTE: those params should
            // include the callback function parameter!
            <provider-specific-handler-params>
          }
        }
      </code>
    </td>
  </tr>
  <tr>
    <td>
      <code>postInvoke</code>
    </td>
    <td>
      After the function is invoked, but before it's result is passed back via the API.
    </td>
    <td>
      <code>
        {
          input: {
            functionId: <string>,
            functionConfig: <object>,
            payload: <object>,
            errorData: <string>,
            outputData: <string>
          },
          output: {}
        }
      </code>
    </td>
    <td>
      <code>
        {
          input: {
            // ...snip...
          },
          output: {
            errorData: <object>,
            outputData: <object>
          }
        }
      </code>
    </td>
  </tr>
</table>

Take a look at our [`core-middlewares`](./src/core-middlewares) to see some example implementations.

Middlewares are loaded and executed in the following order:

1. Load the [`core-middlewares`](./src/core-middlewares) in an alphabetical order
1. Execute the core middlewares in the previously loaded order
1. Load the custom middlewares in the order provided in the config file
1. Execute the custom middlewares in the previously loaded order

## APIs

The Emulator exposes different APIs which makes it possible to interact with it and perform specific actions.

Examples for such actions could e.g. be the deployment or invocation of functions.

Right now only an HTTP API is implemented. However other API types such as (g)RPC are imaginable.

### HTTP API

The Emulator exposes a HTTP API which makes it possible for other services to interact with it via HTTP calls.

#### Functions

##### Deploy function

`POST /v0/emulator/api/functions/deploy`

Request:

- `functionId` - `string` - **required** The id of the function
- `functionConfig` - `object`: - **required** Additional (provider dependent) function configuration
- `zipFilePath` - `string` - **required** The path to the local zip file

Response:

- `functionId` - `string` - The id of the function
- `functionConfig` - `object` - Additional (provider dependent) function configuration
- `zipFilePath` - `string` - The path to the local zip file

##### Invoke function

`POST /v0/emulator/api/functions/invoke`

Request:

- `functionId` - `string` - **required** The id of the function
- `payload` - `object` - **required** The event payload the function should receive
- `method` - `string` - The method of invocation (`async` / `sync`) **default** `async`

Response:

- Result of the function invocation.

#### Utils

##### Heartbeat

`POST /v0/emulator/api/utils/heartbeat`

Request:

- `ping` - `string` - **required** The string the Emulator should return

Response:

- `pong` - `string` - The string the Emulator should return
- `timestamp` - `integer` - Timestamp which indicates when the response was computed


## Community

* [Email Updates](http://eepurl.com/b8dv4P)
* [Serverless Forum](http://forum.serverless.com)
* [Gitter Chatroom](https://gitter.im/serverless/serverless)
* [Serverless Meetups](http://www.meetup.com/serverless/)
* [Facebook](https://www.facebook.com/serverless)
* [Twitter](https://twitter.com/goserverless)
* [Contact Us](mailto:hello@serverless.com)
