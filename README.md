# Robono SDKs

Official headless SDKs for connecting applications to the Robono Bridge.

| Package | Use |
| --- | --- |
| [`@robono/server`](./packages/server) | Server authentication, bridge operations, signed webhooks, and adapters |
| [`@robono/client`](./packages/client) | Shared headless client state and push handling |
| [`@robono/react-native`](./packages/react-native) | React Native and Expo integration |
| [`@robono/web`](./packages/web) | Browser integration |

Start with the [Robono integration guide](https://robono.com/docs#start). Each
package directory also contains its own installation and API documentation.

## Development

Node.js 18 or newer is supported across all four packages. Pull requests and
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
