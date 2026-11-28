"""Ask a running idb_companion to turn its simulator: orient.py <port> <0..3>.

The companion (1.7.x) has idb.CompanionService/set_orientation; the Python
client on this Mac is older and has no command for it, so the request is
sent raw: field 1, a varint — 0 portrait, 1 upside down, 2 landscape left,
3 landscape right.
"""
import asyncio
import sys

from grpclib.client import Channel
from grpclib.const import Cardinality


class Raw:
    def __init__(self, data=b''):
        self.data = data

    def SerializeToString(self):
        return self.data

    @classmethod
    def FromString(cls, data):
        return cls(data)


async def main(port, value):
    ch = Channel('localhost', port)
    try:
        async with ch.request('/idb.CompanionService/set_orientation', Cardinality.UNARY_UNARY, Raw, Raw) as stream:
            await stream.send_message(Raw(bytes([0x08, value])), end=True)
            reply = await stream.recv_message()
            print('ok', reply.data if reply else None)
    finally:
        ch.close()


asyncio.run(main(int(sys.argv[1]), int(sys.argv[2])))
