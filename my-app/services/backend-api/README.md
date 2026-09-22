# services/backend-api

The app's side of [`contracts/backend-api.md`](../../../contracts/backend-api.md)
version 1. Every HTTP call the app makes to the Django service goes through
here, and nothing else in `my-app/` knows the service's URL, its paths or its
status codes.

Four modules. Import from `index.ts`, never from a file inside.

| File | Role |
| --- | --- |
| `types.ts` | The contract as zod schemas, plus `runnableWeights` |
| `client.ts` | The transport. Returns a union, never throws |
| `watch.ts` | The polling state machine, as pure functions |
| `config.ts` | Which URL, from which side of the wire |

## Nothing throws

Every call answers with `{ ok: true, data }` or `{ ok: false, failure }`, and
`BackendFailure` is a discriminated union with four members. That shape is not
style, it is the screen:

| failure | what the analyst is told |
| --- | --- |
| `unreachable` | the service is not answering, nothing was submitted |
| `timeout` | the same, with the budget named |
| `http` | the service answered and refused, with its own sentence and its field errors |
| `malformed` | the service answered with something this app cannot read |

A `try/catch` around `fetch` collapses all four into "something went wrong",
which tells an analyst to go and ask an administrator about a server that is
running perfectly well and simply refused their weights.

`failureMessage()` turns any of them into one line. The page adds what to do
about it, because that is page-specific.

## Why the responses are parsed, not cast

Everything here crosses a process boundary into a service written in another
language and deployed separately. A TypeScript type is a claim about the other
side, not a fact about this one.

The case that motivated it: `progress` arriving as the string `"0.28"`. It
typechecks as `number` if you cast, renders a progress bar at `NaN` percent, and
reads on screen as a run that has stalled. `client.test.ts` pins that exact
input as a `malformed` failure naming the field.

Every object schema is `.loose()`, which is the contract's own rule written as
code: additive fields are not breaking and the app must ignore what it does not
know. Ignoring is not rejecting, and `client.test.ts` pins that too.

## The two base URLs

```
browser   NEXT_PUBLIC_BACKEND_URL   a hostname the analyst's laptop resolves
server    BACKEND_URL               whatever the Next process reaches, which
                                    under compose is http://backend:8000
```

They are usually different and getting it wrong produces a specifically nasty
bug: the page renders on the server, hydrates, and every client fetch then fails
against a hostname that only exists inside the container network. So
`backendBaseUrl()` is for code that runs on either side, and
`publicBackendBaseUrl()` is for URLs that will be handed to a browser (a tile
template, an `<img src>`).

`NEXT_PUBLIC_BACKEND_URL` is read as a literal property access, never through a
variable. Next inlines these at build time by substituting the exact text
`process.env.NEXT_PUBLIC_BACKEND_URL`; a computed lookup is not substituted and
is `undefined` in the browser.

Neither is a module constant. A constant is evaluated at import, which during a
build is on the build host, and the image would then be baked with that host's
environment.

## watch.ts, and what it refuses to do

The running screen is a component with a timer in it, which is the least
testable shape in the app. So every decision lives here instead, as functions
over plain values: what to show after a poll, whether to poll again, and how
long to wait. The component keeps the timer and the markup.

`progress` gets exactly two transformations: a clamp to 0..1 and a monotonic
maximum. An earlier draft also put a floor under it derived from how many stages
had finished, so the bar and the list beside it would agree. It was removed: the
service derives progress from stage WEIGHTS and counting stages is a different
number, so with a fetch stage worth four times the resolve stage, counting
reports 20% for work the service honestly calls 6%. Inventing a more flattering
number than the one the service computed is the failure this module exists to
prevent.

A poll that does not arrive never changes the run's status. The run is almost
certainly still going, and marking it failed would show a failed run that then
succeeds. Transport trouble lives in `transportFailure`; the run's own failure
lives in `error`. Two fields, because they are two sentences.

## runnableWeights

The service requires one weight per criterion, each above zero, summing to 1.0
within 1e-6. This deployment publishes no DEM, so `elevation` cannot run and the
criteria endpoint reports it in `unfilled`. Sending the remaining four weights
unchanged sums to 0.75 and the whole run is refused.

So the unfilled ones are dropped and the survivors renormalised, rounded to the
six places the service rounds to before hashing, with the largest share
absorbing the rounding residual so the sum is exactly 1 rather than nearly 1.
Nearly is a refused run and, worse, a different run id.

## Tests

```
npx vitest run --project=node services/backend-api
```

57 gate tests, 1.2s, no network and no mocking library: `fetch` is injected and
the tests hand it a function. `config.test.ts` tests `resolveBaseUrl` rather
than `backendBaseUrl` on purpose, because testing the latter means installing a
`window` global in a lane that shares one worker across files.
