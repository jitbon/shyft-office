# Contract: The Item Helper (optional AI service)

## Switching it on

Environment variables on the server (never sent to a browser, never written to a file):

| Variable | Meaning |
|---|---|
| `ITEM_AI_KEY` | The key for the service. Without it the helper is `unavailable` and cannot be switched on. |
| `ITEM_AI_MODEL` | Model name. Default `claude-sonnet-5-5`. |
| `ITEM_AI_URL` | Base address of the service. Default the public Anthropic API. |
| `ITEM_AI_TIMEOUT_MS` | How long to wait for an answer. Default 60 000. |

An admin then switches the helper on in the Admin panel. It is off until they do.

## What the server does

A `Drafter` is anything with `draft(request: {text?: string; image?: {type: string; data: Buffer}}, signal: AbortSignal): Promise<unknown>` that returns something shaped like an item definition. One ships: it calls the Anthropic Messages API with the platform `fetch`.

1. The prompt tells the model it is designing a small piece of office furniture, gives the item format (kinds, footprints, limits, patterns, 24-part cap), a short style guide (use few, chunky parts; stand on the floor; face south; pick colors that read well at a small size) and the member's text and/or picture. It asks for one JSON object and nothing else.
2. The reply is parsed as JSON. Anything else is `unusable`.
3. The object is **clamped and validated** with `validateItem`: a name over 32 characters is cut, numbers are rounded to 0.05 and pulled into range, colors are checked, unknown patterns become `plain`; if it still fails it is `unusable`. The model never decides what is stored.
4. The checked design is returned to the member as a draft. The server stores nothing of the request or the reply.

## Failure cases

| Case | The member sees |
|---|---|
| Helper switched off | No helper button. |
| No key set | The button is greyed with "The helper isn't set up on this server." |
| Service refuses, errors or times out | "The helper didn't answer. Nothing was changed. Try again." |
| Reply is not a usable item | "The helper couldn't make that into an item. Try describing it differently." |
| Member cancels | The request is dropped; nothing is stored. |

## Tests

The provider is replaced by a fake `Drafter` in tests (good reply, junk reply, over-limit reply, timeout, refusal). A real service is never called by the test suite.
