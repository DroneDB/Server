#!/bin/bash

ARCH=$(arch)
if [[ "$ARCH" = "x86_64" ]]; then
    ARCH="amd64"
fi

curl -L https://github.com/DroneDB/libnexus/releases/download/v1.0.0/nxs-ubuntu-22.04-$ARCH.deb --output /tmp/nxs-ubuntu-22.04-$ARCH.deb
dpkg-deb -x /tmp/nxs-ubuntu-22.04-$ARCH.deb /usr
rm /tmp/nxs-ubuntu-22.04-$ARCH.deb