"""Check the photo API. --send transmits only a generated, non-personal test image."""

import argparse
import base64
import io
import json

import httpx
from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--web")
    parser.add_argument("--model")
    parser.add_argument("--send", action="store_true")
    args = parser.parse_args()
    with httpx.Client(timeout=180) as client:
        response = client.get(f"{args.api}/api/photo-models")
        response.raise_for_status()
        data = response.json()
        print(
            "Models:",
            [(m["id"], m["vision"], "cloud" if m["cloud"] else "local") for m in data["models"]],
        )
        print("Local Auto default:", data["default_vision"])
        if args.web:
            proxy = client.get(f"{args.web}/api/photo-models")
            proxy.raise_for_status()
            assert proxy.json() == data, "Web proxy differs from API"
            print("Web proxy: passed")
        invalid = client.post(
            f"{args.api}/api/chat",
            json={
                "messages": [
                    {"role": "user", "images": [{"media_type": "image/png", "data": "/etc/passwd"}]}
                ]
            },
        )
        assert invalid.status_code == 422, "File paths must be rejected"
        print("File-path rejection: passed")
        if not args.send:
            return
        chosen = args.model or data["default_vision"]
        if not chosen:
            raise SystemExit("No local vision model. Choose --model explicitly to test cloud.")
        image = Image.new("RGB", (480, 240), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((50, 50, 220, 190), fill="blue")
        draw.ellipse((280, 50, 420, 190), fill="red")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        body = {
            "model": chosen,
            "messages": [
                {
                    "role": "user",
                    "content": "Name the two colored shapes in this image. Be brief.",
                    "images": [
                        {
                            "media_type": "image/png",
                            "data": base64.b64encode(buffer.getvalue()).decode(),
                        }
                    ],
                }
            ],
        }
        answer = ""
        done = False
        with client.stream("POST", f"{args.api}/api/chat", json=body) as stream:
            stream.raise_for_status()
            for line in stream.iter_lines():
                if not line.startswith("data: "):
                    continue
                event = json.loads(line[6:])
                if event["type"] == "error":
                    raise SystemExit(event["message"])
                if event["type"] == "token":
                    answer += event["content"]
                if event["type"] == "done":
                    done = True
        assert done and answer.strip(), "No complete answer"
        print("Generated-image answer:", answer)
        assert "blue" in answer.lower() and "red" in answer.lower(), "Answer missed test colors"
        print("Real vision test: passed")


if __name__ == "__main__":
    main()
