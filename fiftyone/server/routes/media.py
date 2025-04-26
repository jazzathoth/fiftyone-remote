"""
FiftyOne Server /media route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import sys
import logging
import json

import os, anyio, boto3
import typing as t
import mimetypes

from urllib.parse import unquote, urlparse
import anyio
import aiofiles
from aiofiles.threadpool.binary import AsyncBufferedReader
from aiofiles.os import stat as aio_stat
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import (
    RedirectResponse,
    FileResponse,
    Response,
    StreamingResponse,
    guess_type,
)

logger = logging.getLogger(__name__)

async def ranged(
    file: AsyncBufferedReader,
    start: int = 0,
    end: int = None,
    block_size: int = 8192,
) -> t.AsyncGenerator:
    consumed = 0

    await file.seek(start)

    while True:
        data_length = (
            min(block_size, end - start - consumed) if end else block_size
        )

        if data_length <= 0:
            break

        data = await file.read(data_length)

        if not data:
            break

        consumed += data_length

        yield data

    if hasattr(file, "close"):
        await file.close()


class Media(HTTPEndpoint):
    async def get(
        self, request: Request
    ) -> t.Union[FileResponse, StreamingResponse]:

        raw     = request.query_params["filepath"]
        filepath = unquote(raw)

        # 1) HTTP/HTTPS?
        if filepath.startswith(("http://", "https://")):
            return RedirectResponse(filepath)

        # 2) S3?
        parsed = urlparse(filepath)
        if parsed.scheme.lower() == "s3":
            bucket = parsed.netloc
            key    = parsed.path.lstrip("/")

            range_header = request.headers.get("range")

            def fetch():
                client = boto3.client(
                    "s3",
                    endpoint_url="http://stserver.local:9002",
                )
                params = {"Bucket": bucket, "Key": key}
                if range_header:
                    params["Range"] = range_header
                return client.get_object(**params)

            obj = await anyio.to_thread.run_sync(fetch)
            body = obj["Body"]

            # guess the Content-Type if S3 didn't set it
            ext = os.path.splitext(key)[1].lower()
            if ext in (".jpg", ".jpeg"):
                ctype = "image/jpeg"
            elif ext == ".png":
                ctype = "image/png"
            elif ext == ".gif":
                ctype = "image/gif"
            else:
                # fallback to guessing, or even default to octet-stream
                ctype, _ = mimetypes.guess_type(key)
                ctype = ctype or "application/octet-stream"

            # 2) build headers
            headers = {
                "Accept-Ranges": "bytes",
                "Content-Length": str(obj["ContentLength"]),
                # no need to set Content-Type here if you pass media_type below
            }
            if "ContentRange" in obj:
                headers["Content-Range"] = obj["ContentRange"]

            status = 206 if range_header else 200

            # stream the body in 8 KiB chunks
            def iterfile():
                for chunk in iter(lambda: body.read(8192), b""):
                    yield chunk
                body.close()

            return StreamingResponse(iterfile(), 
                                     status_code=status,
                                     media_type=ctype,
                                     headers=headers)

        # 3) Local file fallback
        try:
            await anyio.to_thread.run_sync(os.stat, filepath)
        except FileNotFoundError:
            return Response("Not found custom", status_code=404)

        if request.headers.get("range"):
            resp = await self.ranged_file_response(filepath, request)
        else:
            resp = FileResponse(filepath)

        resp.headers["Accept-Ranges"] = "bytes"
        return resp

    async def ranged_file_response(
        self, path: str, request: Request
    ) -> StreamingResponse:
        file = await aiofiles.open(path, "rb")
        file_size = (await aio_stat(path)).st_size
        content_range = request.headers.get("range")
        content_length = file_size
        status_code = 200
        headers = {}

        if content_range is not None:
            content_range = content_range.strip().lower()

            content_ranges = content_range.split("=")[-1]

            range_start, range_end, *_ = map(
                str.strip, (content_ranges + "-").split("-")
            )

            start, end = (
                int(range_start) if range_start else 0,
                int(range_end) if range_end else file_size - 1,
            )
            range_start = max(0, start)
            range_end = min(file_size - 1, int(end))

            content_length = (end - start) + 1

            file_response = ranged(file, start=start, end=end + 1)

            status_code = 206

            headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

        response = StreamingResponse(
            file_response,
            media_type=guess_type(path)[0],
            status_code=status_code,
        )

        response.headers.update(
            {
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                **headers,
            }
        )

        return response

    async def head(self, request: Request) -> Response:
        path = request.query_params["filepath"]
        response = Response()
        size = (await aio_stat(path)).st_size
        response.headers.update(
            {
                "Accept-Ranges": "bytes",
                "Content-Type": guess_type(path)[0],
                "Content-Length": size,
            }
        )
        return response

    async def options(self, request: Request) -> Response:
        response = Response()
        response.headers["Accept-Ranges"] = "bytes"
        response.headers["Allow"] = "OPTIONS, GET, HEAD"
        return response
