#!/usr/bin/env python3
"""Set the Android signing secrets on the GitHub repository.

Reads the keystore and its password from a local directory (never from the
repository) and uploads them as encrypted Actions secrets using the repo's
public key. Values are never printed.

Usage:
    GIT_TOKEN=<token> python3 scripts/set-android-secrets.py [secrets-dir]

The secrets directory must contain:
    release.keystore    the signing keystore
    keystore.password   the store password (also used as the key password)
"""

import base64
import json
import os
import sys
import urllib.request

from nacl import encoding, public

REPO = "daviekumi-glitch/agent-mobile"
KEY_ALIAS = "agent-mobile"


def api(path, method="GET", data=None):
    req = urllib.request.Request(f"https://api.github.com{path}", method=method)
    req.add_header("Authorization", f"Bearer {os.environ['GIT_TOKEN']}")
    req.add_header("Accept", "application/vnd.github+json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(data).encode()
    with urllib.request.urlopen(req) as resp:
        body = resp.read()
        return json.loads(body) if body else {}


def main():
    secrets_dir = sys.argv[1] if len(sys.argv) > 1 else "/workspace/android-secrets"

    keystore_path = os.path.join(secrets_dir, "release.keystore")
    password_path = os.path.join(secrets_dir, "keystore.password")
    for path in (keystore_path, password_path):
        if not os.path.isfile(path):
            sys.exit(f"missing required file: {path}")

    with open(keystore_path, "rb") as fh:
        keystore_b64 = base64.b64encode(fh.read()).decode()
    with open(password_path) as fh:
        password = fh.read().strip()

    key = api(f"/repos/{REPO}/actions/secrets/public-key")
    sealed_box = public.SealedBox(
        public.PublicKey(key["key"].encode(), encoding.Base64Encoder())
    )

    def put(name, value):
        sealed = sealed_box.encrypt(value.encode())
        api(
            f"/repos/{REPO}/actions/secrets/{name}",
            "PUT",
            {
                "encrypted_value": base64.b64encode(sealed).decode(),
                "key_id": key["key_id"],
            },
        )
        print(f"set {name}")

    put("ANDROID_KEYSTORE_BASE64", keystore_b64)
    put("ANDROID_KEYSTORE_PASSWORD", password)
    put("ANDROID_KEY_ALIAS", KEY_ALIAS)
    put("ANDROID_KEY_PASSWORD", password)

    names = [s["name"] for s in api(f"/repos/{REPO}/actions/secrets")["secrets"]]
    print("repository secrets now:", sorted(names))


if __name__ == "__main__":
    main()
