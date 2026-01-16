# Release steps

## 1) Update versions

1. Update the version in `custom_components/city_visitor_parking/manifest.json`.

## 2) Publish a GitHub release

1. Go to **Releases** on GitHub.
2. Click **Draft a new release**.
3. Use a tag that exactly matches the version (for example `1.2.3`).
4. Fill in the title and release notes.
5. Click **Publish release**.

## 2a) Automatic release notes (Release Drafter)

This repository uses Release Drafter to automatically collect release notes in a draft release.

1. Make sure pull requests have labels such as `bug`, `feature`, or `documentation`.
2. Go to **Releases** on GitHub and open the draft release created by Release Drafter.
3. Review and refine the release notes.
4. Publish the release with a tag that exactly matches the version.

## 2b) Publish a GitHub release via CLI

Prerequisite: you are logged in with GitHub CLI (`gh auth login`).

1. Create a tag that exactly matches the version:
   ```bash
   git tag 1.2.3
   git push origin 1.2.3
   ```
2. Publish the release with automatically generated notes:
   ```bash
   gh release create 1.2.3 --title "1.2.3" --generate-notes
   ```

## 3) Verify release asset

After publishing, the `.github/workflows/release.yaml` workflow starts automatically and uploads `city_visitor_parking.zip` as a release asset.
Check on the release page that the file is present.
