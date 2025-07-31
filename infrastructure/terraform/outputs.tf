output "backend_instance_ip" {
  description = "Public IP of the backend EC2 instance"
  value       = aws_instance.backend.public_ip
}

output "backend_instance_private_ip" {
  description = "Private IP of the backend EC2 instance"
  value       = aws_instance.backend.private_ip
}

output "backend_instance_id" {
  description = "Instance ID of the backend EC2 instance"
  value       = aws_instance.backend.id
}

output "mongodb_instance_ip" {
  description = "Public IP of the MongoDB EC2 instance"
  value       = aws_instance.mongodb.public_ip
}

output "mongodb_instance_private_ip" {
  description = "Private IP of the MongoDB EC2 instance"
  value       = aws_instance.mongodb.private_ip
}

output "mongodb_instance_id" {
  description = "Instance ID of the MongoDB EC2 instance"
  value       = aws_instance.mongodb.id
}

output "mongodb_ebs_volume_id" {
  description = "EBS volume ID attached to the MongoDB instance (if used)"
  value       = aws_ebs_volume.mongodb_storage.id
}
