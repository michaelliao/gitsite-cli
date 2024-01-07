# GitSite Command Line Application

![npm](https://img.shields.io/npm/v/gitsite-cli) ![GitHub License](https://img.shields.io/github/license/michaelliao/gitsite-cli)

GitSite build your well-organized Markdown documents and other resources to static web site that can be deployed simply to GitHub page, etc.

```mermaid
flowchart LR
    md[Markdown Docs]
    gitsite[gitsite-cli Tool]
    build{Build}
    deploy{Deploy}
    html[Static Web Site]
    md --> build
    gitsite --> build
    build --> html
    html --> deploy
    deploy --> github[GitHub Page]
    deploy --> cloudflare[CloudFlare Page]
    deploy --> s3[S3 Website Hosting]
    deploy --> nginx[Self-Hosted Nginx]
```

Read the [user guide](https://gitsite.org).
