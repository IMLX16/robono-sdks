# Robono SDKs

Official SDKs for connecting networks to the Robono Bridge and linking user accounts to independent apps.

| Package | Use |
| --- | --- |
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

Node.js 18 or newer is supported for the Bridge packages. Pull requests and
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
