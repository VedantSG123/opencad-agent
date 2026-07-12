export const oauthCallbackPage = {
  success(provider: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${provider} Authorization Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; text-align: center; padding: 50px; }
            .card { background: #18181b; border: 1px solid #27272a; padding: 40px; border-radius: 12px; display: inline-block; max-width: 400px; margin-top: 10vh; }
            h1 { color: #10b981; margin-top: 0; }
            p { color: #a1a1aa; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Authorization Successful!</h1>
            <p>You have successfully authenticated with <strong>${provider}</strong>. You may close this window and return to OpenCAD Agent.</p>
          </div>
        </body>
      </html>
    `
  },
  error(error: string, provider: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${provider} Authorization Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; text-align: center; padding: 50px; }
            .card { background: #18181b; border: 1px solid #27272a; padding: 40px; border-radius: 12px; display: inline-block; max-width: 400px; margin-top: 10vh; }
            h1 { color: #ef4444; margin-top: 0; }
            p { color: #a1a1aa; line-height: 1.5; }
            .error-box { background: #27272a; border-radius: 6px; padding: 12px; color: #f4f4f5; font-family: monospace; font-size: 14px; margin-top: 20px; word-break: break-all; text-align: left; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Authorization Failed</h1>
            <p>An error occurred while authenticating with <strong>${provider}</strong>.</p>
            <div class="error-box">${error}</div>
          </div>
        </body>
      </html>
    `
  },
}
