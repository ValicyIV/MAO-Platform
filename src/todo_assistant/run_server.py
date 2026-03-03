"""Entry point to run the web server."""

import uvicorn


def main():
    uvicorn.run(
        "todo_assistant.server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )


if __name__ == "__main__":
    main()
