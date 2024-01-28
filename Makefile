image = casparcreek
repo = 539439584689.dkr.ecr.us-west-2.amazonaws.com/casparcreek
function = process_caspar_creek_data


login:
	aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin $(repo)

build:
	docker build -t $(image) .

tag:
	docker tag $(image):latest $(repo):latest


push:
	docker push $(repo):latest

lambda:
	aws lambda update-function-code --image-uri $(repo):latest --function-name $(function)

deploy: build tag push lambda

.PHONY: login build tag push lambda deploy

