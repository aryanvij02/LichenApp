FROM public.ecr.aws/lambda/python:3.13

USER root

# Install build tools needed for compiling scientific packages
RUN dnf update -y && \
    dnf install -y gcc gcc-c++ make zip

RUN mkdir -p /opt/python

COPY requirements.txt /tmp/
RUN pip install -r /tmp/requirements.txt --target /opt/python --no-cache-dir

RUN cd /opt && zip -r9 scientific-packages-layer.zip python/