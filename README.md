# Robono SDKs

Official SDKs for calling within your own app, connecting apps through Robono Bridge, and user-approved account linking. Calling does not require joining the Bridge.

| Package | Use |
| --- | --- |
| [`@robono/calling`](./packages/calling) | One-to-one WebRTC voice calls within an app or across apps, with call history |
| [`@robono/calling-react-native`](./packages/calling-react-native) | Optional branded mobile screens, selectable sounds and native audio adapters |
| [`@robono/server`](./packages/server) | Server authentication, Bridge operations, signed events, and protected client routes |
| [`@robono/client`](./packages/client) | Shared headless client state and push handling |
| [`@robono/react-native`](./packages/react-native) | React Native and Expo integration |
| [`@robono/web`](./packages/web) | Browser integration |
| [`@robono/linked-apps`](./packages/linked-apps) | Preview: user-approved account linking and messaging for independent apps |

Start with the [Robono integration guide](https://robono.com/docs#start). Each
package directory also contains its own installation and API documentation.

The linked-app SDK has a separate [developer guide](https://robono.com/linked-apps).
It requires an approved registration and an activated Robono environment; SDK
installation alone does not enable access.

## Development

Node.js 18 or newer is supported for the messaging packages. Calling SDK development tests require Node.js 22 or newer. Pull requests and
releases are tested on Node 18, 20, 22, and 24. From this repository:

```sh
npm test
```

The SDK source is publicly reviewable. Use and redistribution are governed by
the Robono SDK License Agreement included with each package.

## Support

Use the [Robono SDK support form](https://robono.com/contact?topic=sdk) or email
support@robono.com.

For security issues, follow [SECURITY.md](./SECURITY.md).

Copyright © 2026 Add to Loop LLC.
