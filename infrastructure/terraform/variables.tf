variable "admin_mongo_user" {
  type = string
}

variable "admin_mongo_password" {
  type      = string
  sensitive = true
}

variable "s3_mongo_user" {
  type = string
}

variable "s3_mongo_password" {
  type      = string
  sensitive = true
}
