export function observeAdrotateResponse(response: Response, html: string, expectedMediaBasename: string | null = null) {
  return {
    status: response.status,
    fetchedAt: new Date().toISOString(),
    headers: Object.fromEntries(['cache-control', 'cf-cache-status', 'age', 'date', 'last-modified', 'content-type']
      .map(name => [name, response.headers.get(name)?.slice(0, 1024) ?? null])),
    containsExpectedMediaBasename: expectedMediaBasename ? html.includes(expectedMediaBasename) : null,
  };
}
