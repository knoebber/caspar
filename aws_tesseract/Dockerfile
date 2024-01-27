FROM public.ecr.aws/lambda/python:3.11 as build

WORKDIR /app

RUN mkdir -p package/lib package/bin

RUN yum install -y git

RUN git clone https://github.com/bweigel/aws-lambda-tesseract-layer.git
RUN cp /app/aws-lambda-tesseract-layer/ready-to-use/amazonlinux-2/bin/* /app/package/bin/ && \
    cp /app/aws-lambda-tesseract-layer/ready-to-use/amazonlinux-2/lib/* /app/package/lib/ && \
    cp -R /app/aws-lambda-tesseract-layer/ready-to-use/amazonlinux-2/tesseract /app/package/tesseract

FROM public.ecr.aws/lambda/python:3.11

COPY --from=build /app/package/ /opt/
RUN pip install pytesseract boto3

COPY app.py ${LAMBDA_TASK_ROOT}

CMD ["app.handler"]
