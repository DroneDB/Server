#!/bin/bash

curl -L https://github.com/DroneDB/libnexus/releases/download/v1.0.0/nxs-ubuntu-22.04-$(arch).deb --output /tmp/nxs-ubuntu-22.04-$(arch).deb
dpkg-deb -x /tmp/nxs-ubuntu-22.04-$(arch).deb /usr
rm /tmp/nxs-ubuntu-22.04-$(arch).deb