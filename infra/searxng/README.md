# Self-hosted web search

This local SearXNG instance gives `commons-api` live web search without a paid
search API key. It is bound to localhost and enables the JSON response format
used by `webSearch`.

Start it:

```bash
docker compose -f infra/searxng/docker-compose.yml up -d
```

Then add this to `apps/commons-api/.env` and restart the API:

```dotenv
WEB_SEARCH_PROVIDER=searxng
SEARXNG_BASE_URL=http://localhost:8888
SEARXNG_API_KEY=local-search-key
SEARXNG_SEARCH_COST_USD_PER_CALL=0
```

Verify the endpoint:

```bash
curl --get http://localhost:8888/search \
  --header 'X-Agent-Commons-Search-Key: local-search-key' \
  --data-urlencode 'q=agent commons' \
  --data 'format=json'
```

SearXNG is a metasearch service: it operates without a vendor API key, but
still queries upstream public search engines. For production, deploy it as a
private service or retain the included authenticated middleware, set strong
`SEARXNG_SECRET` and `SEARXNG_API_KEY` values, and point the API's
`SEARXNG_BASE_URL` at its address.
