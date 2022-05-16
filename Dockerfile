FROM node:14
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 5000

COPY . /server

RUN bash -c "/server/vendor/ddb/scripts/ubuntu_deps.sh"

RUN cd /server/vendor/ddb && npm install
RUN cd /server/vendor/hub && npm install -g webpack@4 webpack-cli && webpack --mode=production

RUN apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 5000/tcp
VOLUME [ "/storage" ]
WORKDIR /server

ENTRYPOINT node index.js /storage