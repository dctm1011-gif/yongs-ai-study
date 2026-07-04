#!/usr/bin/env python3
"""API 엔드포인트 테스트"""
import requests
import json

def test_feedback_api():
    print("=" * 60)
    print("Testing /api/feedback endpoint")
    print("=" * 60)

    url = "http://localhost:5000/api/feedback"
    data = {
        "text": "In my opinion, technology has made relationships stronger. First, it allows people to stay connected across distances. For example, families can use video calls to maintain close bonds. Second, technology provides new ways to meet and communicate with people who share similar interests.",
        "type": "writing",
        "prompt": "Do you agree or disagree with the following statement? Technology has made human relationships weaker because people rely more on digital communication than face-to-face interaction.",
        "structure": {}
    }

    try:
        print(f"\nSending request to {url}")
        print(f"Text length: {len(data['text'])} characters")
        response = requests.post(url, json=data, timeout=30)
        print(f"Status Code: {response.status_code}")

        result = response.json()
        if "feedback" in result:
            feedback = result["feedback"]
            print(f"\n[SUCCESS] Feedback received ({len(feedback)} characters)")
            print(f"\nFeedback preview (first 300 chars):")
            print(feedback[:300])
            print("...")
            return True
        elif "error" in result:
            print(f"\n[ERROR] {result['error']}")
            return False
        else:
            print(f"\n[ERROR] Unexpected response:")
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return False
    except requests.exceptions.Timeout:
        print("[ERROR] Request timeout (30s)")
        return False
    except requests.exceptions.ConnectionError as e:
        print(f"[ERROR] Connection failed: {e}")
        return False
    except Exception as e:
        print(f"[ERROR] {type(e).__name__}: {e}")
        return False

def test_save_response_api():
    print("\n" + "=" * 60)
    print("Testing /api/save-response endpoint")
    print("=" * 60)

    url = "http://localhost:5000/api/save-response"
    data = {
        "date": "2026-06-30",
        "prompt": "Test prompt",
        "answer": "Test answer text",
        "feedback": "Test feedback",
        "wordCount": 42,
        "timestamp": "2026-06-30T12:00:00Z"
    }

    try:
        print(f"\nSending request to {url}")
        response = requests.post(url, json=data, timeout=10)
        print(f"Status Code: {response.status_code}")

        result = response.json()
        if "ok" in result and result["ok"]:
            print(f"[SUCCESS] Response saved (total: {result.get('total', '?')})")
            return True
        elif "error" in result:
            print(f"[ERROR] {result['error']}")
            return False
        else:
            print(f"[ERROR] Unexpected response:")
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return False
    except Exception as e:
        print(f"[ERROR] {type(e).__name__}: {e}")
        return False

if __name__ == "__main__":
    success = True
    success = test_feedback_api() and success
    success = test_save_response_api() and success

    print("\n" + "=" * 60)
    if success:
        print("[OK] All tests passed!")
    else:
        print("[ERROR] Some tests failed!")
    print("=" * 60)
