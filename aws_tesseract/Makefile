image = casparcreek
repo = 539439584689.dkr.ecr.us-west-2.amazonaws.com/casparcreek

login:
	aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin $(repo)

build:
	docker build -t $(image) .

tag:
	docker tag $(image):latest $(repo):latest


push:
	docker push $(repo):latest

deploy: build tag push
