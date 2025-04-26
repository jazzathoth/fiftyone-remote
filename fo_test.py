import fiftyone as fo

fo.config.database_uri = "mongodb://stserver.local:27017"
fo.config.launch_app = True
fo.config.app_port = 5152

dataset = fo.load_dataset("weeds-data-debug")
session = fo.launch_app(dataset)
