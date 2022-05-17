FROM ubuntu:focal as builder
MAINTAINER Piero Toffanin <pt@masseranolabs.com>
ENV DEBIAN_FRONTEND=noninteractive

EXPOSE 5000

# Prerequisites
ENV TZ=America/New_York
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
RUN apt update && apt install -y --fix-missing --no-install-recommends build-essential software-properties-common
RUN add-apt-repository -y ppa:ubuntugis/ubuntugis-unstable
RUN apt install -y --fix-missing --no-install-recommends ca-certificates cmake git checkinstall sqlite3 spatialite-bin libgeos-dev libgdal-dev g++-10 gcc-10 pdal libpdal-dev libzip-dev nodejs npm
RUN update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-10 1000 --slave /usr/bin/g++ g++ /usr/bin/g++-10
RUN apt install -y curl && curl -L https://github.com/DroneDB/libnexus/releases/download/v1.0.0/nxs-ubuntu-20.04-amd64.deb --output /tmp/nxs-ubuntu-20.04-amd64.deb && \
    dpkg-deb -x /tmp/nxs-ubuntu-20.04-amd64.deb /usr && \
    rm /tmp/nxs-ubuntu-20.04-amd64.deb && \
    apt remove -y curl

# Build ddb components
COPY . /server

RUN cd /server/vendor/ddb && npm install
RUN cd /server/vendor/ddb/build && checkinstall --install=no --pkgname DroneDB --default

# Build hub components
RUN npm install -g webpack@4 webpack-cli
RUN cd /server/vendor/hub && npm install && webpack --mode=production

# ---> Run stage
FROM ubuntu:focal as runner

RUN apt update && apt install -y --fix-missing --no-install-recommends gnupg2 ca-certificates && \
    echo "deb https://ppa.launchpadcontent.net/ubuntugis/ubuntugis-unstable/ubuntu focal main" >> /etc/apt/sources.list && \
    echo "deb-src https://ppa.launchpadcontent.net/ubuntugis/ubuntugis-unstable/ubuntu focal main" >> /etc/apt/sources.list && \
    apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 6b827c12c2d425e227edca75089ebe08314df160 && \
    apt-get update && apt-get install -y curl libspatialite7 libgdal30 libzip5 libpdal-base12 libgeos3.10.1 && \
    curl -L https://github.com/DroneDB/libnexus/releases/download/v1.0.0/nxs-ubuntu-20.04-amd64.deb --output /tmp/nxs-ubuntu-20.04-amd64.deb && \
    dpkg-deb -x /tmp/nxs-ubuntu-20.04-amd64.deb /usr && \
    rm /tmp/nxs-ubuntu-20.04-amd64.deb && \
    apt remove -y gnupg2 curl && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

COPY . /server

# Install DroneDB from deb package and set library path
COPY --from=builder /server/vendor/ddb/build/*.deb /
RUN dpkg -i *.deb && rm /*.deb && mkdir /storage
COPY --from=builder /server/vendor/hub/build /server/vendor/hub/build

ENV LD_LIBRARY_PATH="/usr/local/lib:${LD_LIBRARY_PATH}"
ENV PATH="/server/vendor/ddb/build:${PATH}"
WORKDIR /server
EXPOSE 5000/tcp
VOLUME [ "/storage" ]

ENTRYPOINT ["node", "index.js", "/storage"]
